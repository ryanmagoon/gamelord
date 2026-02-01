#include <napi.h>
#include "libretro_core.h"

Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
  return LibretroCore::Init(env, exports);
}

NODE_API_MODULE(gamelord_libretro, InitAll)
