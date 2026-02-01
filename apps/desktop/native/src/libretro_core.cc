#include "libretro_core.h"
#include <cstdarg>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <algorithm>

// Singleton for static callbacks
LibretroCore *LibretroCore::s_instance = nullptr;

Napi::Object LibretroCore::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "LibretroCore", {
    InstanceMethod("loadCore", &LibretroCore::LoadCore),
    InstanceMethod("loadGame", &LibretroCore::LoadGame),
    InstanceMethod("unloadGame", &LibretroCore::UnloadGame),
    InstanceMethod("run", &LibretroCore::Run),
    InstanceMethod("reset", &LibretroCore::Reset),
    InstanceMethod("getSystemInfo", &LibretroCore::GetSystemInfo),
    InstanceMethod("getAVInfo", &LibretroCore::GetAVInfo),
    InstanceMethod("getVideoFrame", &LibretroCore::GetVideoFrame),
    InstanceMethod("getAudioBuffer", &LibretroCore::GetAudioBuffer),
    InstanceMethod("setInputState", &LibretroCore::SetInputState),
    InstanceMethod("serializeState", &LibretroCore::SerializeState),
    InstanceMethod("unserializeState", &LibretroCore::UnserializeState),
    InstanceMethod("getSerializeSize", &LibretroCore::GetSerializeSize),
    InstanceMethod("destroy", &LibretroCore::Destroy),
    InstanceMethod("isLoaded", &LibretroCore::IsLoaded),
    InstanceMethod("setSystemDirectory", &LibretroCore::SetSystemDirectory),
    InstanceMethod("setSaveDirectory", &LibretroCore::SetSaveDirectory),
  });

  Napi::FunctionReference *constructor = new Napi::FunctionReference();
  *constructor = Napi::Persistent(func);
  env.SetInstanceData(constructor);

  exports.Set("LibretroCore", func);
  return exports;
}

LibretroCore::LibretroCore(const Napi::CallbackInfo &info)
    : Napi::ObjectWrap<LibretroCore>(info) {
  s_instance = this;
}

LibretroCore::~LibretroCore() {
  CloseCore();
  if (s_instance == this) {
    s_instance = nullptr;
  }
}

// ---------------------------------------------------------------------------
// N-API Methods
// ---------------------------------------------------------------------------

Napi::Value LibretroCore::LoadCore(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected core path string").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string corePath = info[0].As<Napi::String>().Utf8Value();

  // Close any previously loaded core
  CloseCore();

#ifdef _WIN32
  dl_handle_ = LoadLibraryA(corePath.c_str());
  if (!dl_handle_) {
    Napi::Error::New(env, "Failed to load core: " + corePath).ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }
#else
  dl_handle_ = dlopen(corePath.c_str(), RTLD_NOW | RTLD_LOCAL);
  if (!dl_handle_) {
    const char *dl_err = dlerror();
    std::string err = dl_err ? dl_err : "Unknown error";
    Napi::Error::New(env, "Failed to load core: " + err).ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }
#endif

  if (!ResolveFunctions()) {
    CloseCore();
    Napi::Error::New(env, "Failed to resolve core functions").ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  fprintf(stderr, "[libretro] LoadCore: setting environment callback\n");
  // retro_set_environment must be called before retro_init
  fn_set_environment_(EnvironmentCallback);

  fprintf(stderr, "[libretro] LoadCore: calling retro_init\n");
  // retro_init allocates core internal state; must be called before other set_* callbacks
  fn_init_();
  fprintf(stderr, "[libretro] LoadCore: retro_init done, setting callbacks\n");

  // Set remaining callbacks after init (cores may need internal state allocated)
  fn_set_video_refresh_(VideoRefreshCallback);
  fn_set_audio_sample_(AudioSampleCallback);
  fn_set_audio_sample_batch_(AudioSampleBatchCallback);
  fn_set_input_poll_(InputPollCallback);
  fn_set_input_state_(InputStateCallback);
  core_loaded_ = true;

  return Napi::Boolean::New(env, true);
}

Napi::Value LibretroCore::LoadGame(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (!core_loaded_) {
    Napi::Error::New(env, "No core loaded").ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected ROM path string").ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  std::string romPath = info[0].As<Napi::String>().Utf8Value();

  // Check if core needs fullpath or if we should load into memory
  struct retro_system_info sysinfo = {};
  fn_get_system_info_(&sysinfo);

  struct retro_game_info gameinfo = {};
  gameinfo.path = romPath.c_str();

  // Always load ROM into memory — some cores report need_fullpath but
  // still benefit from having data available, and it ensures the core
  // can access the ROM even if it can't open the path itself.
  std::vector<uint8_t> rom_data;
  {
    std::ifstream file(romPath, std::ios::binary | std::ios::ate);
    if (!file.is_open()) {
      Napi::Error::New(env, "Failed to open ROM: " + romPath).ThrowAsJavaScriptException();
      return Napi::Boolean::New(env, false);
    }

    size_t size = file.tellg();
    file.seekg(0, std::ios::beg);
    rom_data.resize(size);
    file.read(reinterpret_cast<char *>(rom_data.data()), size);

    gameinfo.data = rom_data.data();
    gameinfo.size = size;
  }

  // Prepare extended game info for GET_GAME_INFO_EXT
  {
    std::string fullPath = romPath;
    // Extract directory
    size_t lastSlash = fullPath.rfind('/');
    if (lastSlash == std::string::npos) lastSlash = fullPath.rfind('\\');
    game_dir_ = (lastSlash != std::string::npos) ? fullPath.substr(0, lastSlash) : ".";

    // Extract filename without extension
    std::string filename = (lastSlash != std::string::npos) ? fullPath.substr(lastSlash + 1) : fullPath;
    size_t dotPos = filename.rfind('.');
    game_name_ = (dotPos != std::string::npos) ? filename.substr(0, dotPos) : filename;

    // Extract extension (lowercase, without dot)
    game_ext_ = "";
    if (dotPos != std::string::npos) {
      game_ext_ = filename.substr(dotPos + 1);
      std::transform(game_ext_.begin(), game_ext_.end(), game_ext_.begin(), ::tolower);
    }

    game_info_ext_ = {};
    game_info_ext_.full_path = romPath.c_str();
    game_info_ext_.archive_path = nullptr;
    game_info_ext_.archive_file = nullptr;
    game_info_ext_.dir = game_dir_.c_str();
    game_info_ext_.name = game_name_.c_str();
    game_info_ext_.ext = game_ext_.c_str();
    game_info_ext_.meta = nullptr;
    game_info_ext_.data = gameinfo.data;
    game_info_ext_.size = gameinfo.size;
    game_info_ext_.file_in_archive = false;
  }

  fprintf(stderr, "[libretro] Loading game: path=%s, ext=%s, need_fullpath=%d, data=%p, size=%zu\n",
          gameinfo.path, game_ext_.c_str(), sysinfo.need_fullpath, gameinfo.data, gameinfo.size);

  if (!fn_load_game_(&gameinfo)) {
    fprintf(stderr, "[libretro] retro_load_game returned false\n");
    Napi::Error::New(env, "Core rejected the game").ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  // Get AV info after loading game
  fn_get_system_av_info_(&av_info_);
  game_loaded_ = true;

  return Napi::Boolean::New(env, true);
}

void LibretroCore::UnloadGame(const Napi::CallbackInfo &info) {
  if (game_loaded_ && fn_unload_game_) {
    fn_unload_game_();
    game_loaded_ = false;
  }
}

void LibretroCore::Run(const Napi::CallbackInfo &info) {
  if (!game_loaded_ || !fn_run_) return;
  fn_run_();
}

void LibretroCore::Reset(const Napi::CallbackInfo &info) {
  if (!game_loaded_ || !fn_reset_) return;
  fn_reset_();
}

Napi::Value LibretroCore::GetSystemInfo(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (!core_loaded_) {
    return env.Null();
  }

  struct retro_system_info sysinfo = {};
  fn_get_system_info_(&sysinfo);

  Napi::Object obj = Napi::Object::New(env);
  obj.Set("libraryName", Napi::String::New(env, sysinfo.library_name ? sysinfo.library_name : ""));
  obj.Set("libraryVersion", Napi::String::New(env, sysinfo.library_version ? sysinfo.library_version : ""));
  obj.Set("validExtensions", Napi::String::New(env, sysinfo.valid_extensions ? sysinfo.valid_extensions : ""));
  obj.Set("needFullpath", Napi::Boolean::New(env, sysinfo.need_fullpath));
  obj.Set("blockExtract", Napi::Boolean::New(env, sysinfo.block_extract));

  return obj;
}

Napi::Value LibretroCore::GetAVInfo(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (!game_loaded_) {
    return env.Null();
  }

  Napi::Object obj = Napi::Object::New(env);

  Napi::Object geometry = Napi::Object::New(env);
  geometry.Set("baseWidth", Napi::Number::New(env, av_info_.geometry.base_width));
  geometry.Set("baseHeight", Napi::Number::New(env, av_info_.geometry.base_height));
  geometry.Set("maxWidth", Napi::Number::New(env, av_info_.geometry.max_width));
  geometry.Set("maxHeight", Napi::Number::New(env, av_info_.geometry.max_height));
  geometry.Set("aspectRatio", Napi::Number::New(env, av_info_.geometry.aspect_ratio));

  Napi::Object timing = Napi::Object::New(env);
  timing.Set("fps", Napi::Number::New(env, av_info_.timing.fps));
  timing.Set("sampleRate", Napi::Number::New(env, av_info_.timing.sample_rate));

  obj.Set("geometry", geometry);
  obj.Set("timing", timing);

  return obj;
}

Napi::Value LibretroCore::GetVideoFrame(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  std::lock_guard<std::mutex> lock(video_mutex_);

  if (!video_frame_ready_ || video_buffer_.empty()) {
    return env.Null();
  }

  Napi::Object frame = Napi::Object::New(env);
  frame.Set("width", Napi::Number::New(env, video_width_));
  frame.Set("height", Napi::Number::New(env, video_height_));

  // Copy video buffer to a new ArrayBuffer for JS
  Napi::ArrayBuffer ab = Napi::ArrayBuffer::New(env, video_buffer_.size());
  memcpy(ab.Data(), video_buffer_.data(), video_buffer_.size());
  frame.Set("data", Napi::Uint8Array::New(env, video_buffer_.size(), ab, 0));

  video_frame_ready_ = false;

  return frame;
}

Napi::Value LibretroCore::GetAudioBuffer(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  std::lock_guard<std::mutex> lock(audio_mutex_);

  if (audio_buffer_.empty()) {
    return env.Null();
  }

  size_t byte_size = audio_buffer_.size() * sizeof(int16_t);
  Napi::ArrayBuffer ab = Napi::ArrayBuffer::New(env, byte_size);
  memcpy(ab.Data(), audio_buffer_.data(), byte_size);

  Napi::Int16Array arr = Napi::Int16Array::New(env, audio_buffer_.size(), ab, 0);
  audio_buffer_.clear();

  return arr;
}

void LibretroCore::SetInputState(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (info.Length() < 3) {
    Napi::TypeError::New(env, "Expected (port, id, value)").ThrowAsJavaScriptException();
    return;
  }

  unsigned port = info[0].As<Napi::Number>().Uint32Value();
  unsigned id = info[1].As<Napi::Number>().Uint32Value();
  int16_t value = static_cast<int16_t>(info[2].As<Napi::Number>().Int32Value());

  if (port < 2 && id < 16) {
    std::lock_guard<std::mutex> lock(input_mutex_);
    input_state_[port][id] = value;
  }
}

Napi::Value LibretroCore::GetSerializeSize(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (!game_loaded_ || !fn_serialize_size_) {
    return Napi::Number::New(env, 0);
  }

  return Napi::Number::New(env, static_cast<double>(fn_serialize_size_()));
}

Napi::Value LibretroCore::SerializeState(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (!game_loaded_ || !fn_serialize_ || !fn_serialize_size_) {
    return env.Null();
  }

  size_t size = fn_serialize_size_();
  if (size == 0) return env.Null();

  Napi::ArrayBuffer ab = Napi::ArrayBuffer::New(env, size);
  if (!fn_serialize_(ab.Data(), size)) {
    return env.Null();
  }

  return Napi::Uint8Array::New(env, size, ab, 0);
}

Napi::Value LibretroCore::UnserializeState(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (!game_loaded_ || !fn_unserialize_) {
    return Napi::Boolean::New(env, false);
  }

  if (info.Length() < 1 || !info[0].IsTypedArray()) {
    Napi::TypeError::New(env, "Expected Uint8Array").ThrowAsJavaScriptException();
    return Napi::Boolean::New(env, false);
  }

  Napi::Uint8Array arr = info[0].As<Napi::Uint8Array>();
  bool ok = fn_unserialize_(arr.Data(), arr.ByteLength());

  return Napi::Boolean::New(env, ok);
}

void LibretroCore::Destroy(const Napi::CallbackInfo &info) {
  CloseCore();
}

Napi::Value LibretroCore::IsLoaded(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  return Napi::Boolean::New(env, core_loaded_.load() && game_loaded_.load());
}

void LibretroCore::SetSystemDirectory(const Napi::CallbackInfo &info) {
  if (info.Length() >= 1 && info[0].IsString()) {
    system_directory_ = info[0].As<Napi::String>().Utf8Value();
  }
}

void LibretroCore::SetSaveDirectory(const Napi::CallbackInfo &info) {
  if (info.Length() >= 1 && info[0].IsString()) {
    save_directory_ = info[0].As<Napi::String>().Utf8Value();
  }
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

void LibretroCore::CloseCore() {
  if (game_loaded_ && fn_unload_game_) {
    fn_unload_game_();
    game_loaded_ = false;
  }

  if (core_loaded_ && fn_deinit_) {
    fn_deinit_();
    core_loaded_ = false;
  }

  if (dl_handle_) {
#ifdef _WIN32
    FreeLibrary(dl_handle_);
#else
    dlclose(dl_handle_);
#endif
    dl_handle_ = nullptr;
  }

  if (s_instance == this) {
    s_instance = nullptr;
  }
}

bool LibretroCore::ResolveFunctions() {
#ifdef _WIN32
  #define RESOLVE(name) fn_##name##_ = reinterpret_cast<retro_##name##_t>(GetProcAddress(dl_handle_, "retro_" #name))
#else
  #define RESOLVE(name) fn_##name##_ = reinterpret_cast<retro_##name##_t>(dlsym(dl_handle_, "retro_" #name))
#endif

  RESOLVE(set_environment);
  RESOLVE(set_video_refresh);
  RESOLVE(set_audio_sample);
  RESOLVE(set_audio_sample_batch);
  RESOLVE(set_input_poll);
  RESOLVE(set_input_state);
  RESOLVE(init);
  RESOLVE(deinit);
  RESOLVE(api_version);
  RESOLVE(get_system_info);
  RESOLVE(get_system_av_info);
  RESOLVE(set_controller_port_device);
  RESOLVE(reset);
  RESOLVE(run);
  RESOLVE(serialize_size);
  RESOLVE(serialize);
  RESOLVE(unserialize);
  RESOLVE(load_game);
  RESOLVE(unload_game);
  RESOLVE(get_region);
  RESOLVE(get_memory_data);
  RESOLVE(get_memory_size);

#undef RESOLVE

  // Check required functions
  return fn_set_environment_ && fn_set_video_refresh_ && fn_set_audio_sample_ &&
         fn_set_audio_sample_batch_ && fn_set_input_poll_ && fn_set_input_state_ &&
         fn_init_ && fn_deinit_ && fn_get_system_info_ && fn_get_system_av_info_ &&
         fn_run_ && fn_load_game_ && fn_unload_game_;
}

// ---------------------------------------------------------------------------
// Static Callbacks
// ---------------------------------------------------------------------------

bool LibretroCore::EnvironmentCallback(unsigned cmd, void *data) {
  LibretroCore *self = s_instance;
  if (!self) {
    fprintf(stderr, "[libretro] EnvironmentCallback cmd=%u but s_instance is NULL!\n", cmd);
    return false;
  }

  switch (cmd) {
    case RETRO_ENVIRONMENT_SET_PIXEL_FORMAT: {
      unsigned *fmt = static_cast<unsigned *>(data);
      self->pixel_format_ = *fmt;
      return true;
    }

    case RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY: {
      const char **dir = static_cast<const char **>(data);
      if (self->system_directory_.empty()) {
        *dir = ".";
      } else {
        *dir = self->system_directory_.c_str();
      }
      return true;
    }

    case RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY: {
      const char **dir = static_cast<const char **>(data);
      if (self->save_directory_.empty()) {
        *dir = ".";
      } else {
        *dir = self->save_directory_.c_str();
      }
      return true;
    }

    case RETRO_ENVIRONMENT_GET_LOG_INTERFACE: {
      struct retro_log_callback *cb = static_cast<struct retro_log_callback *>(data);
      cb->log = LogCallback;
      return true;
    }

    case RETRO_ENVIRONMENT_GET_VARIABLE: {
      // Return no variables for now
      struct retro_variable *var = static_cast<struct retro_variable *>(data);
      var->value = nullptr;
      return false;
    }

    case RETRO_ENVIRONMENT_GET_CORE_OPTIONS_VERSION: {
      // Report that we support core options v2
      unsigned *version = static_cast<unsigned *>(data);
      *version = 2;
      return true;
    }

    case RETRO_ENVIRONMENT_SET_CORE_OPTIONS:
    case RETRO_ENVIRONMENT_SET_CORE_OPTIONS_INTL:
    case RETRO_ENVIRONMENT_SET_CORE_OPTIONS_V2:
    case RETRO_ENVIRONMENT_SET_CORE_OPTIONS_V2_INTL:
    case RETRO_ENVIRONMENT_SET_CORE_OPTIONS_DISPLAY:
    case RETRO_ENVIRONMENT_SET_CORE_OPTIONS_UPDATE_DISPLAY_CALLBACK:
      // Accept core options silently (we don't use them yet)
      return true;

    case RETRO_ENVIRONMENT_SET_VARIABLES:
    case RETRO_ENVIRONMENT_GET_VARIABLE_UPDATE:
      return false;

    case RETRO_ENVIRONMENT_SET_CONTENT_INFO_OVERRIDE:
      return true;

    case RETRO_ENVIRONMENT_GET_GAME_INFO_EXT:
      return false;

    case RETRO_ENVIRONMENT_GET_INPUT_BITMASKS:
      return true;

    case RETRO_ENVIRONMENT_SET_INPUT_DESCRIPTORS:
    case RETRO_ENVIRONMENT_SET_CONTROLLER_INFO:
    case RETRO_ENVIRONMENT_SET_SUBSYSTEM_INFO:
    case RETRO_ENVIRONMENT_SET_MEMORY_MAPS:
    case RETRO_ENVIRONMENT_SET_SERIALIZATION_QUIRKS:
      return true;

    case RETRO_ENVIRONMENT_GET_MESSAGE_INTERFACE_VERSION: {
      unsigned *version = static_cast<unsigned *>(data);
      *version = 0;
      return true;
    }

    case RETRO_ENVIRONMENT_GET_INPUT_MAX_USERS: {
      unsigned *max_users = static_cast<unsigned *>(data);
      *max_users = 2;
      return true;
    }

    case RETRO_ENVIRONMENT_SET_GEOMETRY: {
      if (data) {
        struct retro_game_geometry *geom = static_cast<struct retro_game_geometry *>(data);
        self->av_info_.geometry = *geom;
      }
      return true;
    }

    case RETRO_ENVIRONMENT_SET_SUPPORT_NO_GAME:
    case RETRO_ENVIRONMENT_SET_PERFORMANCE_LEVEL:
      return true;

    default:
      fprintf(stderr, "[libretro] Unhandled environment command: %u\n", cmd);
      return false;
  }
}

void LibretroCore::VideoRefreshCallback(const void *data, unsigned width, unsigned height, size_t pitch) {
  LibretroCore *self = s_instance;
  if (!self || !data) return;

  // Convert to RGBA8888 regardless of source format
  size_t out_size = width * height * 4;

  std::lock_guard<std::mutex> lock(self->video_mutex_);
  self->video_buffer_.resize(out_size);
  self->video_width_ = width;
  self->video_height_ = height;

  uint8_t *dst = self->video_buffer_.data();
  const uint8_t *src = static_cast<const uint8_t *>(data);

  switch (self->pixel_format_) {
    case RETRO_PIXEL_FORMAT_XRGB8888: {
      for (unsigned y = 0; y < height; y++) {
        const uint32_t *row = reinterpret_cast<const uint32_t *>(src + y * pitch);
        for (unsigned x = 0; x < width; x++) {
          uint32_t px = row[x];
          *dst++ = (px >> 16) & 0xFF; // R
          *dst++ = (px >> 8)  & 0xFF; // G
          *dst++ =  px        & 0xFF; // B
          *dst++ = 0xFF;              // A
        }
      }
      break;
    }

    case RETRO_PIXEL_FORMAT_RGB565: {
      for (unsigned y = 0; y < height; y++) {
        const uint16_t *row = reinterpret_cast<const uint16_t *>(src + y * pitch);
        for (unsigned x = 0; x < width; x++) {
          uint16_t px = row[x];
          *dst++ = ((px >> 11) & 0x1F) * 255 / 31; // R
          *dst++ = ((px >> 5)  & 0x3F) * 255 / 63; // G
          *dst++ = ( px        & 0x1F) * 255 / 31; // B
          *dst++ = 0xFF;                            // A
        }
      }
      break;
    }

    case RETRO_PIXEL_FORMAT_0RGB1555:
    default: {
      for (unsigned y = 0; y < height; y++) {
        const uint16_t *row = reinterpret_cast<const uint16_t *>(src + y * pitch);
        for (unsigned x = 0; x < width; x++) {
          uint16_t px = row[x];
          *dst++ = ((px >> 10) & 0x1F) * 255 / 31; // R
          *dst++ = ((px >> 5)  & 0x1F) * 255 / 31; // G
          *dst++ = ( px        & 0x1F) * 255 / 31; // B
          *dst++ = 0xFF;                            // A
        }
      }
      break;
    }
  }

  self->video_frame_ready_ = true;
}

void LibretroCore::AudioSampleCallback(int16_t left, int16_t right) {
  LibretroCore *self = s_instance;
  if (!self) return;

  std::lock_guard<std::mutex> lock(self->audio_mutex_);
  self->audio_buffer_.push_back(left);
  self->audio_buffer_.push_back(right);
}

size_t LibretroCore::AudioSampleBatchCallback(const int16_t *data, size_t frames) {
  LibretroCore *self = s_instance;
  if (!self || !data) return 0;

  std::lock_guard<std::mutex> lock(self->audio_mutex_);
  // Stereo: frames * 2 samples
  self->audio_buffer_.insert(self->audio_buffer_.end(), data, data + frames * 2);

  return frames;
}

void LibretroCore::InputPollCallback() {
  // Nothing to do — input is set directly via setInputState
}

int16_t LibretroCore::InputStateCallback(unsigned port, unsigned device, unsigned index, unsigned id) {
  LibretroCore *self = s_instance;
  if (!self) return 0;

  if (device != RETRO_DEVICE_JOYPAD || port >= 2 || id >= 16) return 0;

  std::lock_guard<std::mutex> lock(self->input_mutex_);
  return self->input_state_[port][id];
}

void LibretroCore::LogCallback(enum retro_log_level level, const char *fmt, ...) {
  char buf[2048];
  va_list args;
  va_start(args, fmt);
  vsnprintf(buf, sizeof(buf), fmt, args);
  va_end(args);

  const char *level_str = "INFO";
  switch (level) {
    case RETRO_LOG_DEBUG: level_str = "DEBUG"; break;
    case RETRO_LOG_INFO:  level_str = "INFO";  break;
    case RETRO_LOG_WARN:  level_str = "WARN";  break;
    case RETRO_LOG_ERROR: level_str = "ERROR"; break;
    default: break;
  }

  fprintf(stderr, "[libretro %s] %s", level_str, buf);
}
