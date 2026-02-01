{
  "targets": [
    {
      "target_name": "gamelord_libretro",
      "sources": [
        "src/addon.cc",
        "src/libretro_core.cc"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "src"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS"
      ],
      "conditions": [
        ["OS=='mac'", {
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "CLANG_CXX_LIBRARY": "libc++",
            "MACOSX_DEPLOYMENT_TARGET": "10.15",
            "OTHER_CPLUSPLUSFLAGS": ["-std=c++17"]
          },
          "libraries": [
            "-framework CoreAudio",
            "-framework AudioToolbox"
          ]
        }],
        ["OS=='linux'", {
          "cflags_cc": ["-std=c++17", "-fPIC"],
          "libraries": ["-ldl", "-lpthread", "-lasound"]
        }],
        ["OS=='win'", {
          "msvs_settings": {
            "VCCLCompilerTool": {
              "AdditionalOptions": ["/std:c++17"]
            }
          }
        }]
      ]
    }
  ]
}
