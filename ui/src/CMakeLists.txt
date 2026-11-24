cmake_minimum_required (VERSION 3.22)

# Статический CRT: плагину не нужен установленный Visual C++ Redistributable
set (CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

project (LumenEventHorizon VERSION 0.2.0 LANGUAGES C CXX)

set (CMAKE_CXX_STANDARD 20)
set (CMAKE_CXX_STANDARD_REQUIRED ON)

if (MSVC)
    add_compile_options (/utf-8 /MP)   # UTF-8 для имени «Lumen · Event Horizon»
endif()

option (LUMEN_BUILD_TESTS "Собрать консольные DSP-тесты" ON)
set (LUMEN_JUCE_TAG "8.0.11" CACHE STRING "Версия JUCE (git tag)")
set (LUMEN_WEBVIEW2_VERSION "1.0.2535.41" CACHE STRING "Версия NuGet-пакета Microsoft.Web.WebView2")

# ---------------------------------------------------------------------------
# Веб-интерфейс: ui/dist-plugin/plugin.html (один файл, JS/CSS встроены)
# ---------------------------------------------------------------------------
set (LUMEN_UI_DIR  "${CMAKE_CURRENT_SOURCE_DIR}/ui")
set (LUMEN_UI_HTML "${LUMEN_UI_DIR}/dist-plugin/plugin.html")

if (NOT EXISTS "${LUMEN_UI_HTML}")
    find_program (NPM_EXE NAMES npm.cmd npm)
    if (NOT NPM_EXE)
        message (FATAL_ERROR "Нет ${LUMEN_UI_HTML}. Установите Node.js 20+ или соберите UI вручную:\n  cd ui && npm ci && npm run build:plugin")
    endif()
    message (STATUS "Lumen: сборка веб-интерфейса (npm ci && npm run build:plugin)")
    execute_process (COMMAND "${NPM_EXE}" ci WORKING_DIRECTORY "${LUMEN_UI_DIR}" RESULT_VARIABLE r1)
    execute_process (COMMAND "${NPM_EXE}" run build:plugin WORKING_DIRECTORY "${LUMEN_UI_DIR}" RESULT_VARIABLE r2)
    if (NOT r1 EQUAL 0 OR NOT r2 EQUAL 0 OR NOT EXISTS "${LUMEN_UI_HTML}")
        message (FATAL_ERROR "Не удалось собрать веб-интерфейс")
    endif()
endif()

# ---------------------------------------------------------------------------
# WebView2 SDK (NuGet) — нужен JUCE для Chromium-движка на Windows
# ---------------------------------------------------------------------------
if (WIN32)
    set (JUCE_WEBVIEW2_PACKAGE_LOCATION "${CMAKE_BINARY_DIR}/nuget")
    if (NOT EXISTS "${JUCE_WEBVIEW2_PACKAGE_LOCATION}/Microsoft.Web.WebView2.${LUMEN_WEBVIEW2_VERSION}")
        find_program (NUGET_EXE NAMES nuget nuget.exe)
        if (NOT NUGET_EXE)
            set (NUGET_EXE "${CMAKE_BINARY_DIR}/tools/nuget.exe")
            if (NOT EXISTS "${NUGET_EXE}")
                message (STATUS "Lumen: загрузка nuget.exe")
                file (DOWNLOAD "https://dist.nuget.org/win-x86-commandline/latest/nuget.exe" "${NUGET_EXE}" STATUS dl)
            endif()
        endif()
        execute_process (COMMAND "${NUGET_EXE}" install Microsoft.Web.WebView2 -Version ${LUMEN_WEBVIEW2_VERSION}
                                 -OutputDirectory "${JUCE_WEBVIEW2_PACKAGE_LOCATION}" -NonInteractive
                         RESULT_VARIABLE nugetResult)
        if (NOT nugetResult EQUAL 0)
            message (FATAL_ERROR "Не удалось установить NuGet-пакет Microsoft.Web.WebView2")
        endif()
    endif()
endif()

# ---------------------------------------------------------------------------
# JUCE
# ---------------------------------------------------------------------------
include (FetchContent)
set (FETCHCONTENT_QUIET OFF)
FetchContent_Declare (JUCE
    GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
    GIT_TAG        ${LUMEN_JUCE_TAG}
    GIT_SHALLOW    TRUE)
FetchContent_MakeAvailable (JUCE)

juce_add_plugin (LumenEventHorizon
    COMPANY_NAME             "Lumen"
    COMPANY_WEBSITE          "https://lumen.audio"
    PLUGIN_MANUFACTURER_CODE Lumn
    PLUGIN_CODE              LmEH
    PRODUCT_NAME             "Lumen Event Horizon"
    PLUGIN_NAME              "Lumen · Event Horizon"
    DESCRIPTION              "Immersive FDN reverb (mono … 7.1.6)"
    VERSION                  ${PROJECT_VERSION}
    FORMATS                  VST3 Standalone
    IS_SYNTH                 FALSE
    NEEDS_MIDI_INPUT         FALSE
    NEEDS_MIDI_OUTPUT        FALSE
    IS_MIDI_EFFECT           FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS TRUE
    VST3_CATEGORIES          Fx Reverb Spatial
    NEEDS_WEB_BROWSER        TRUE
    NEEDS_WEBVIEW2           TRUE
    COPY_PLUGIN_AFTER_BUILD  FALSE)

juce_add_binary_data (LumenUIData SOURCES "${LUMEN_UI_HTML}")

target_sources (LumenEventHorizon PRIVATE
    Source/PluginProcessor.cpp
    Source/PluginEditor.cpp
    Source/DSP/LumenReverbCore.cpp)

target_compile_definitions (LumenEventHorizon PUBLIC
    JUCE_WEB_BROWSER=1
    JUCE_USE_CURL=0
    JUCE_VST3_CAN_REPLACE_VST2=0
    $<$<PLATFORM_ID:Windows>:JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1>)

target_link_libraries (LumenEventHorizon
    PRIVATE
        LumenUIData
        juce::juce_audio_utils
        juce::juce_gui_extra
    PUBLIC
        juce::juce_recommended_config_flags
        juce::juce_recommended_lto_flags
        juce::juce_recommended_warning_flags)

# ---------------------------------------------------------------------------
# DSP-тесты (без JUCE): стабильность, NaN/денормалы, бесконечный сустейн, Freeze, Kill, CPU, WAV-импульсы
# ---------------------------------------------------------------------------
if (LUMEN_BUILD_TESTS)
    add_executable (LumenDspTests tests/dsp_test.cpp Source/DSP/LumenReverbCore.cpp)
    target_include_directories (LumenDspTests PRIVATE Source)
    enable_testing()
    add_test (NAME LumenDspTests COMMAND LumenDspTests "${CMAKE_BINARY_DIR}/dsp-report")
endif()
