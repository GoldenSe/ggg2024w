function createUnityInstance(canvas, config, callback) {
    function handleLog(message, type) {
        if (!handleLog.aborted && config.showBanner) {
            if (type === "error") handleLog.aborted = true;
            config.showBanner(message, type);
        } else {
            switch (type) {
                case "error":
                    console.error(message);
                    break;
                case "warning":
                    console.warn(message);
                    break;
                default:
                    console.log(message);
            }
        }
    }

    function handleError(error) {
        const reason = error.reason || error.error;
        const message = reason ? reason.toString() : error.message || error.reason || "";
        const stack = reason && reason.stack ? reason.stack.toString() : "";
        const formattedStack = (message + "\n" + (stack.startsWith(message) ? stack.substring(message.length) : stack)).trim();
        if (formattedStack && l.stackTraceRegExp && l.stackTraceRegExp.test(message)) {
            reportError(message, error.filename || reason?.fileName || reason?.sourceURL || "", error.lineno || reason?.lineNumber || reason?.line || 0);
        }
    }

    function ensureConfigOption(config, key, defaultValue) {
        if (config[key] === undefined || config[key] === null) {
            console.warn(`Config option "${key}" is missing or empty. Falling back to default value: "${defaultValue}". Consider updating your WebGL template to include the missing config option.`);
            config[key] = defaultValue;
        }
    }

    callback = callback || function () {};

    const defaultConfig = {
        canvas,
        webglContextAttributes: { preserveDrawingBuffer: false, powerPreference: 2 },
        cacheControl: (url) => url === defaultConfig.dataUrl || url.match(/\.bundle/) ? "must-revalidate" : "no-store",
        streamingAssetsUrl: "StreamingAssets",
        downloadProgress: {},
        deinitializers: [],
        intervals: {},
        setInterval: function (callback, interval) {
            const id = window.setInterval(callback, interval);
            this.intervals[id] = true;
            return id;
        },
        clearInterval: function (id) {
            delete this.intervals[id];
            window.clearInterval(id);
        },
        preRun: [],
        postRun: [],
        print: console.log,
        printErr: function (message) {
            console.error(message);
            if (typeof message === "string") {
                if (message.includes("wasm streaming compile failed")) {
                    handleLog('HTTP Response Header "Content-Type" configured incorrectly on the server for file ' + defaultConfig.codeUrl + ' , should be "application/wasm". Startup time performance will suffer.', "warning");
                } else if (message.toLowerCase().includes("mime")) {
                    handleLog('WebAssembly streaming compilation failed! This can happen if "Content-Encoding" HTTP header is incorrectly enabled on the server for file ' + defaultConfig.codeUrl + ", but the file is not pre-compressed on disk (or vice versa). Check the Network tab in browser Devtools to debug server header configuration.", "warning");
                }
            }
        },
        locateFile: function (file) { return file === "build.wasm" ? this.codeUrl : file; },
        disabledCanvasEvents: ["contextmenu", "dragstart"]
    };

    Object.assign(defaultConfig, config);
    defaultConfig.streamingAssetsUrl = new URL(defaultConfig.streamingAssetsUrl, document.URL).href;

    const disabledEvents = [...defaultConfig.disabledCanvasEvents];
    function preventDefault(e) { e.preventDefault(); }
    disabledEvents.forEach(event => canvas.addEventListener(event, preventDefault));

    function handleFullscreenChange() {
        if (document.webkitCurrentFullScreenElement === canvas) {
            if (canvas.style.width) {
                fullscreenWidth = canvas.style.width;
                fullscreenHeight = canvas.style.height;
                canvas.style.width = "100%";
                canvas.style.height = "100%";
            }
        } else if (fullscreenWidth) {
            canvas.style.width = fullscreenWidth;
            canvas.style.height = fullscreenHeight;
            fullscreenWidth = fullscreenHeight = "";
        }
    }

    let fullscreenWidth = "", fullscreenHeight = "";
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);

    defaultConfig.deinitializers.push(() => {
        disabledEvents.forEach(event => canvas.removeEventListener(event, preventDefault));
        window.removeEventListener("error", handleError);
        window.removeEventListener("unhandledrejection", handleError);
        document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
        Object.keys(defaultConfig.intervals).forEach(id => window.clearInterval(id));
        defaultConfig.intervals = {};
    });

    defaultConfig.QuitCleanup = function () {
        defaultConfig.deinitializers.forEach(fn => fn());
        defaultConfig.deinitializers = [];
        if (typeof defaultConfig.onQuit === "function") defaultConfig.onQuit();
    };

    function reportError(message, filename, lineNumber) {
        if (!reportError.didShowErrorMessage) {
            let errorMessage = `An error occurred running the Unity content on this page. See your browser JavaScript console for more info. The error was:\n${message}`;
            if (message.includes("DISABLE_EXCEPTION_CATCHING")) {
                errorMessage = "An exception has occurred, but exception handling has been disabled in this build. If you are the developer of this content, enable exceptions in your project WebGL player settings to be able to catch the exception or see the stack trace.";
            } else if (message.includes("Cannot enlarge memory arrays")) {
                errorMessage = "Out of memory. If you are the developer of this content, try allocating more memory to your WebGL build in the WebGL player settings.";
            } else if (["Invalid array buffer length", "Invalid typed array length", "out of memory", "could not allocate memory"].some(phrase => message.includes(phrase))) {
                errorMessage = "The browser could not allocate enough memory for the WebGL content. If you are the developer of this content, try allocating less memory to your WebGL build in the WebGL player settings.";
            }
            alert(errorMessage);
            reportError.didShowErrorMessage = true;
        }
    }

    function updateDownloadProgress(event, progress) {
        if (event !== "symbolsUrl") {
            const downloadProgress = defaultConfig.downloadProgress[event] || { started: false, finished: false, lengthComputable: false, total: 0, loaded: 0 };
            if (event.type === "progress" || event.type === "load") {
                if (!downloadProgress.started) {
                    downloadProgress.started = true;
                    downloadProgress.lengthComputable = event.lengthComputable;
                    downloadProgress.total = event.total;
                    downloadProgress.loaded = event.loaded;
                } else if (event.type === "load") {
                    downloadProgress.finished = true;
                }
                defaultConfig.downloadProgress[event] = downloadProgress;
                let totalSize = 0;
                let totalLoaded = 0;
                let countComputable = 0;
                let countNotComputable = 0;

                for (const key in defaultConfig.downloadProgress) {
                    const progress = defaultConfig.downloadProgress[key];
                    if (!progress.started) return;
                    if (progress.lengthComputable) {
                        totalLoaded += progress.loaded;
                        totalSize += progress.total;
                        countComputable++;
                    } else if (!progress.finished) {
                        countNotComputable++;
                    }
                }

                callback(.9 * (countComputable ? (countComputable - countNotComputable - (totalSize ? (countComputable * (totalSize - totalLoaded) / totalSize) : 0)) / countComputable : 0));
            }
        }
    }

    function fetchAndCacheData() {
        return new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = defaultConfig.frameworkUrl;
            script.onload = () => {
                if (typeof unityFramework === "undefined") {
                    let errorMsg = "Unable to parse " + defaultConfig.frameworkUrl + "!";
                    if (defaultConfig.frameworkUrl.endsWith(".gz") || defaultConfig.frameworkUrl.endsWith(".br")) {
                        errorMsg += " This can happen if build compression was enabled but web server hosting the content was misconfigured to not serve the file with the correct Content-Encoding.";
                        if (location.protocol === "file:") {
                            errorMsg += " Loading pre-compressed content via a file:// URL without a proper server configuration is unsupported.";
                        }
                    }
                    handleLog(errorMsg, "error");
                    reject(new Error(errorMsg));
                } else {
                    resolve(unityFramework);
                }
            };
            script.onerror = () => reject(new Error("Failed to load script"));
            document.body.appendChild(script);
        });
    }

    function startUnityInstance() {
        fetchAndCacheData()
            .then(unityFramework => {
                if (typeof UnityLoader !== "undefined") {
                    return UnityLoader.instantiate(canvas, defaultConfig);
                } else {
                    throw new Error("UnityLoader is not defined");
                }
            })
            .then(instance => {
                callback(instance);
            })
            .catch(error => {
                handleError(error);
            });
    }

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleError);

    if (typeof config.instantiateOnStart !== "undefined" && !config.instantiateOnStart) {
        console.warn("Unity instance will not be instantiated immediately. You need to call createUnityInstance() manually.");
    } else {
        startUnityInstance();
    }
}
