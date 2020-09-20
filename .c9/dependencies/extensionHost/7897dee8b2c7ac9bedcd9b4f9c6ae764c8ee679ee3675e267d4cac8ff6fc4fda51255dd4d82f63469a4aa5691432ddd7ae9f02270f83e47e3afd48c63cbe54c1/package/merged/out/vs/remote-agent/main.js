var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
define(["require", "exports", "path", "fs", "net", "child_process", "vs/base/common/objects", "vs/base/parts/ipc/node/ipc.net", "vs/base/common/event", "vs/base/parts/ipc/common/ipc.net", "vs/base/common/buffer", "vs/platform/extensions/common/extensions", "vs/base/common/uri", "vs/base/common/amd", "vs/base/common/lifecycle", "vs/workbench/services/extensions/common/extensionHostProtocol", "vs/base/common/types"], function (require, exports, path, fs, net_1, child_process_1, objects, ipc_net_1, event_1, ipc_net_2, buffer_1, extensions_1, uri_1, amd_1, lifecycle_1, extensionHostProtocol_1, types) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    class RemoteHost {
        constructor(extensionPaths, logsFolder, envParams) {
            this.extensionPaths = extensionPaths;
            this.logsFolder = logsFolder;
            this.envParams = envParams;
            this._terminating = false;
            this._disposables = new lifecycle_1.DisposableStore();
            this._onUnexpectedExit = new event_1.Emitter();
            this.onUnexpectedExit = this._onUnexpectedExit.event;
            this._onUnexpectedError = new event_1.Emitter();
            this.onUnexpectedError = this._onUnexpectedError.event;
            this._disposables.add(this._onUnexpectedError);
            this._disposables.add(this._onUnexpectedExit);
        }
        // The code here is similar to (and partially copy-pasted from) ExtensionHostProcessWorker
        // located in vs/workbench/services/extensions/electron-browser/extensionHost.ts
        createHost() {
            return __awaiter(this, void 0, void 0, function* () {
                const pipeName = yield this._tryListenOnPipe();
                const opts = {
                    env: objects.mixin(objects.deepClone(this.envParams), {
                        AMD_ENTRYPOINT: "vs/workbench/services/extensions/node/extensionHostProcess",
                        PIPE_LOGGING: "true",
                        VERBOSE_LOGGING: true,
                        VSCODE_IPC_HOOK_EXTHOST: pipeName,
                        VSCODE_HANDLES_UNCAUGHT_ERRORS: true,
                        VSCODE_LOG_STACK: false,
                        VSCODE_LOG_LEVEL: "log",
                        // VFS worker (and this file) is started by an ssh connection from a non-interactive shell.
                        // Because of that environment variables intended for interactive shells aren't exported.
                        // Ensure that LANG exists, as it's required for sam cli.
                        LANG: this.envParams.LANG || "en_US.utf-8",
                    }),
                    // We only detach the extension host on windows. Linux and Mac orphan by default
                    // and detach under Linux and Mac create another process group.
                    // We detach because we have noticed that when the renderer exits, its child processes
                    // (i.e. extension host) are taken down in a brutal fashion by the OS
                    // detached: !!platform.isWindows,
                    detached: false,
                    execArgv: undefined,
                    silent: true,
                };
                // const bootFile = path.join(__dirname, "../src/bootstrap-fork.js");
                const bootFile = amd_1.getPathFromAmdModule(require, "bootstrap-fork");
                this._extensionHostProcess = child_process_1.fork(bootFile, ["--type=extensionHost"], opts);
                this._extensionHostProcess.stdout.setEncoding("utf8");
                this._extensionHostProcess.stderr.setEncoding("utf8");
                const onStdout = event_1.Event.fromNodeEventEmitter(this._extensionHostProcess.stdout, "data");
                const onStderr = event_1.Event.fromNodeEventEmitter(this._extensionHostProcess.stderr, "data");
                const onOutput = event_1.Event.any(event_1.Event.map(onStdout, (o) => ({ data: `%c${o}`, format: [""] })), event_1.Event.map(onStderr, (o) => ({ data: `%c${o}`, format: ["color: red"] })));
                // Debounce all output, so we can render it in the Chrome console as a group
                const onDebouncedOutput = event_1.Event.debounce(onOutput, (r, o) => {
                    return r
                        ? { data: r.data + o.data, format: [...r.format, ...o.format] }
                        : { data: o.data, format: o.format };
                }, 100);
                // Print out extension host output
                onDebouncedOutput((output) => {
                    console.group("Extension Host Output");
                    console.log(output.data, ...output.format);
                    console.groupEnd();
                });
                // Support logging from extension host
                this._extensionHostProcess.on("message", (msg) => {
                    if (msg.type === "__$console") {
                        console.log(`Extension Host [${msg.severity}]:`, ...JSON.parse(msg.arguments));
                        return;
                    }
                    console.group("Extension Host Message");
                    console.log(msg);
                    console.groupEnd();
                });
                this._extensionHostProcess.on("exit", this._onExtHostProcessExit.bind(this));
                this._extensionHostProcess.on("error", this._onExtHostProcessError.bind(this));
                this._extensionHostProtocol = yield this._connectToExtHost();
                // TODO: move to node 10+ and uncomment this
                // (socket.off is not a function in node 8)
                // this._disposables.add(this._extensionHostProtocol);
                return this._extensionHostProtocol;
            });
        }
        _tryListenOnPipe() {
            return new Promise((resolve, reject) => {
                const pipeName = ipc_net_1.generateRandomPipeName();
                this._namedPipeServer = net_1.createServer();
                this._namedPipeServer.on("error", reject);
                this._namedPipeServer.listen(pipeName, () => {
                    if (this._namedPipeServer) {
                        this._namedPipeServer.removeListener("error", reject);
                    }
                    resolve(pipeName);
                });
            });
        }
        _connectToExtHost() {
            return new Promise((resolve, reject) => {
                // Wait for the extension host to connect to our named pipe
                // and wrap the socket in the message passing protocol
                let handle = setTimeout(() => {
                    if (this._namedPipeServer) {
                        this._namedPipeServer.close();
                        this._namedPipeServer = null;
                    }
                    reject("timeout");
                }, 60 * 1000);
                this._namedPipeServer.on("connection", (socket) => {
                    clearTimeout(handle);
                    if (this._namedPipeServer) {
                        this._namedPipeServer.close();
                        this._namedPipeServer = null;
                    }
                    socket.on("error", this._onExtHostProcessError.bind(this));
                    this._extensionHostConnection = socket;
                    // using a buffered message protocol here because between now
                    // and the first time a `then` executes some messages might be lost
                    // unless we immediately register a listener for `onMessage`.
                    resolve(new ipc_net_2.PersistentProtocol(new ipc_net_1.NodeSocket(this._extensionHostConnection)));
                });
            });
        }
        _getHostProcessPid() {
            return __awaiter(this, void 0, void 0, function* () {
                return this._extensionHostProcess ? this._extensionHostProcess.pid : null;
            });
        }
        getEnvironment() {
            return __awaiter(this, void 0, void 0, function* () {
                return {
                    pid: process.pid,
                    extensions: yield this.getExtensionPackages(),
                    os: 3 /* Linux */,
                    // TODO: figure out what exactly do we need here
                    // @ts-ignore
                    appRoot: undefined,
                    // @ts-ignore
                    appSettingsHome: undefined,
                    // @ts-ignore
                    settingsPath: undefined,
                    // @ts-ignore
                    // TODO change this to real path to global storage
                    logsPath: uri_1.URI.file(this.logsFolder),
                    // @ts-ignore
                    // TODO change this to real path to global storage
                    extensionHostLogsPath: uri_1.URI.file(this.logsFolder),
                    // @ts-ignore
                    userHome: undefined,
                };
            });
        }
        getExtensionPackages() {
            return __awaiter(this, void 0, void 0, function* () {
                try {
                    const packages = [];
                    for (const path of this.extensionPaths) {
                        const extensionPackage = this.getPackage(path);
                        const localizedMessages = this.getNlsMessageBundle(path);
                        if (extensionPackage) {
                            if (localizedMessages) {
                                this.replaceNLSPlaceholders(extensionPackage, localizedMessages);
                            }
                            packages.push(this.createExtensionDescription(path, extensionPackage));
                        }
                    }
                    return packages;
                }
                catch (e) {
                    if (e.code === "ENOENT") {
                        console.error("Could not find extensions directory.");
                        return [];
                    }
                    throw e;
                }
            });
        }
        replaceNLSPlaceholders(literal, messages) {
            processObject(literal);
            function processObject(literal) {
                for (let key in literal) {
                    if (literal.hasOwnProperty(key)) {
                        processEntry(literal, key);
                    }
                }
            }
            function processEntry(obj, key) {
                let value = obj[key];
                if (types.isString(value)) {
                    let length = value.length;
                    if (length > 1 && value[0] === "%" && value[length - 1] === "%") {
                        let messageKey = value.substr(1, length - 2);
                        let message = messages[messageKey];
                        if (message) {
                            obj[key] = message;
                        }
                        else {
                            console.warn("Couldn't find message for key {0}.", messageKey);
                        }
                    }
                }
                else if (types.isObject(value)) {
                    processObject(value);
                }
                else if (types.isArray(value)) {
                    for (let i = 0; i < value.length; i++) {
                        processEntry(value, i);
                    }
                }
            }
        }
        getPackage(extensionFolder) {
            try {
                return JSON.parse(fs.readFileSync(path.join(extensionFolder, "package.json"), { encoding: "utf8" }));
            }
            catch (e) {
                return null;
            }
        }
        getNlsMessageBundle(extensionPath) {
            try {
                const packagePath = this.getPackageMetadataPath(extensionPath);
                return JSON.parse(fs.readFileSync(packagePath, { encoding: "utf8" }));
            }
            catch (e) {
                return null;
            }
        }
        getPackageMetadataPath(extensionPath) {
            return path.join(extensionPath, "package.nls.json");
        }
        createExtensionDescription(extensionPath, packageData) {
            return Object.assign({}, packageData, { identifier: new extensions_1.ExtensionIdentifier(`${packageData.publisher}.${packageData.name}`), isBuiltin: false, isUnderDevelopment: false, extensionLocation: uri_1.URI.file(extensionPath) });
        }
        _onExtHostProcessExit(code, signal) {
            if (!this._terminating) {
                this._onUnexpectedExit.fire([code, signal]);
            }
            this._extensionHostProcess = null;
            this._clearResources();
        }
        _onExtHostProcessError(error) {
            this._onUnexpectedError.fire(error);
        }
        dispose() {
            if (this._terminating) {
                return;
            }
            this._terminating = true;
            this._sendTerminateSignal();
            // In case we won't receive "exit" event from the host:
            this._clearResourcesTimeoutId = setTimeout(() => this._clearResources(), 10 * 1000);
            this._disposables.add(lifecycle_1.toDisposable(() => clearTimeout(this._clearResourcesTimeoutId)));
        }
        _sendTerminateSignal() {
            if (this._extensionHostProtocol) {
                this._extensionHostProtocol.send(extensionHostProtocol_1.createMessageOfType(2 /* Terminate */));
            }
        }
        _clearResources() {
            this._disposables.dispose();
            if (this._namedPipeServer) {
                this._namedPipeServer.close();
            }
            if (this._extensionHostConnection) {
                this._extensionHostConnection.end();
            }
            if (this._extensionHostProcess) {
                this._extensionHostProcess.kill();
                this._extensionHostProcess = null;
            }
        }
    }
    exports.RemoteHost = RemoteHost;
    // Export VSBuffer for use in vfs extension that consumes this module
    // (c9.extensions.remotehost/remote-host)
    exports.Buffer = buffer_1.VSBuffer;
});
//# sourceMappingURL=main.js.map