#ifndef LIBRETRO_CORE_H
#define LIBRETRO_CORE_H

#include <napi.h>
#include <string>
#include <vector>
#include <mutex>
#include <atomic>
#include <unordered_map>

#ifdef __APPLE__
#include <dlfcn.h>
#elif defined(_WIN32)
#include <windows.h>
#else
#include <dlfcn.h>
#endif

#include "libretro.h"

class LibretroCore : public Napi::ObjectWrap<LibretroCore> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  LibretroCore(const Napi::CallbackInfo &info);
  ~LibretroCore();

private:
  // N-API methods
  Napi::Value LoadCore(const Napi::CallbackInfo &info);
  Napi::Value LoadGame(const Napi::CallbackInfo &info);
  void UnloadGame(const Napi::CallbackInfo &info);
  void Run(const Napi::CallbackInfo &info);
  void Reset(const Napi::CallbackInfo &info);
  Napi::Value GetSystemInfo(const Napi::CallbackInfo &info);
  Napi::Value GetAVInfo(const Napi::CallbackInfo &info);
  Napi::Value GetVideoFrame(const Napi::CallbackInfo &info);
  Napi::Value GetAudioBuffer(const Napi::CallbackInfo &info);
  void SetInputState(const Napi::CallbackInfo &info);
  Napi::Value SerializeState(const Napi::CallbackInfo &info);
  Napi::Value UnserializeState(const Napi::CallbackInfo &info);
  Napi::Value GetSerializeSize(const Napi::CallbackInfo &info);
  void Destroy(const Napi::CallbackInfo &info);
  Napi::Value IsLoaded(const Napi::CallbackInfo &info);
  void SetSystemDirectory(const Napi::CallbackInfo &info);
  void SetSaveDirectory(const Napi::CallbackInfo &info);

  // Internal
  void CloseCore();
  bool ResolveFunctions();

  // libretro callbacks (static because libretro API uses C function pointers)
  static bool EnvironmentCallback(unsigned cmd, void *data);
  static void VideoRefreshCallback(const void *data, unsigned width, unsigned height, size_t pitch);
  static void AudioSampleCallback(int16_t left, int16_t right);
  static size_t AudioSampleBatchCallback(const int16_t *data, size_t frames);
  static void InputPollCallback();
  static int16_t InputStateCallback(unsigned port, unsigned device, unsigned index, unsigned id);
  static void LogCallback(enum retro_log_level level, const char *fmt, ...);

  // Singleton instance pointer for static callbacks
  static LibretroCore *s_instance;

  // Dynamic library handle
#ifdef _WIN32
  HMODULE dl_handle_ = nullptr;
#else
  void *dl_handle_ = nullptr;
#endif

  // Resolved function pointers
  retro_set_environment_t fn_set_environment_ = nullptr;
  retro_set_video_refresh_t fn_set_video_refresh_ = nullptr;
  retro_set_audio_sample_t fn_set_audio_sample_ = nullptr;
  retro_set_audio_sample_batch_t fn_set_audio_sample_batch_ = nullptr;
  retro_set_input_poll_t fn_set_input_poll_ = nullptr;
  retro_set_input_state_t fn_set_input_state_ = nullptr;
  retro_init_t fn_init_ = nullptr;
  retro_deinit_t fn_deinit_ = nullptr;
  retro_api_version_t fn_api_version_ = nullptr;
  retro_get_system_info_t fn_get_system_info_ = nullptr;
  retro_get_system_av_info_t fn_get_system_av_info_ = nullptr;
  retro_set_controller_port_device_t fn_set_controller_port_device_ = nullptr;
  retro_reset_t fn_reset_ = nullptr;
  retro_run_t fn_run_ = nullptr;
  retro_serialize_size_t fn_serialize_size_ = nullptr;
  retro_serialize_t fn_serialize_ = nullptr;
  retro_unserialize_t fn_unserialize_ = nullptr;
  retro_load_game_t fn_load_game_ = nullptr;
  retro_unload_game_t fn_unload_game_ = nullptr;
  retro_get_region_t fn_get_region_ = nullptr;
  retro_get_memory_data_t fn_get_memory_data_ = nullptr;
  retro_get_memory_size_t fn_get_memory_size_ = nullptr;

  // State
  std::atomic<bool> core_loaded_{false};
  std::atomic<bool> game_loaded_{false};
  unsigned pixel_format_ = RETRO_PIXEL_FORMAT_0RGB1555;

  // Video frame buffer (written by callback, read by JS)
  std::mutex video_mutex_;
  std::vector<uint8_t> video_buffer_;
  unsigned video_width_ = 0;
  unsigned video_height_ = 0;
  bool video_frame_ready_ = false;

  // Audio buffer (written by callback, read by JS)
  std::mutex audio_mutex_;
  std::vector<int16_t> audio_buffer_;

  // Input state (written by JS, read by callback)
  std::mutex input_mutex_;
  // input_state_[port][id] = pressed
  int16_t input_state_[2][16] = {};

  // Directories
  std::string system_directory_;
  std::string save_directory_;

  // AV info cache
  struct retro_system_av_info av_info_ = {};

  // Game info for GET_GAME_INFO_EXT during retro_load_game
  struct retro_game_info_ext game_info_ext_ = {};
  std::string game_dir_;
  std::string game_name_;
  std::string game_ext_;
};

#endif // LIBRETRO_CORE_H
