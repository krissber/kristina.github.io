/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
define(["require", "exports", "vs/base/browser/fastDomNode", "vs/base/common/color", "vs/editor/browser/view/viewPart", "vs/editor/common/core/position", "vs/editor/common/modes", "vs/editor/common/view/editorColorRegistry"], function (require, exports, fastDomNode_1, color_1, viewPart_1, position_1, modes_1, editorColorRegistry_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    class Settings {
        constructor(config, theme) {
            this.lineHeight = config.editor.lineHeight;
            this.pixelRatio = config.editor.pixelRatio;
            this.overviewRulerLanes = config.editor.viewInfo.overviewRulerLanes;
            this.renderBorder = config.editor.viewInfo.overviewRulerBorder;
            const borderColor = theme.getColor(editorColorRegistry_1.editorOverviewRulerBorder);
            this.borderColor = borderColor ? borderColor.toString() : null;
            this.hideCursor = config.editor.viewInfo.hideCursorInOverviewRuler;
            const cursorColor = theme.getColor(editorColorRegistry_1.editorCursorForeground);
            this.cursorColor = cursorColor ? cursorColor.transparent(0.7).toString() : null;
            this.themeType = theme.type;
            const minimapEnabled = config.editor.viewInfo.minimap.enabled;
            const minimapSide = config.editor.viewInfo.minimap.side;
            const backgroundColor = (minimapEnabled ? modes_1.TokenizationRegistry.getDefaultBackground() : null);
            if (backgroundColor === null || minimapSide === 'left') {
                this.backgroundColor = null;
            }
            else {
                this.backgroundColor = color_1.Color.Format.CSS.formatHex(backgroundColor);
            }
            const position = config.editor.layoutInfo.overviewRuler;
            this.top = position.top;
            this.right = position.right;
            this.domWidth = position.width;
            this.domHeight = position.height;
            this.canvasWidth = (this.domWidth * this.pixelRatio) | 0;
            this.canvasHeight = (this.domHeight * this.pixelRatio) | 0;
            const [x, w] = this._initLanes(1, this.canvasWidth, this.overviewRulerLanes);
            this.x = x;
            this.w = w;
        }
        _initLanes(canvasLeftOffset, canvasWidth, laneCount) {
            const remainingWidth = canvasWidth - canvasLeftOffset;
            if (laneCount >= 3) {
                const leftWidth = Math.floor(remainingWidth / 3);
                const rightWidth = Math.floor(remainingWidth / 3);
                const centerWidth = remainingWidth - leftWidth - rightWidth;
                const leftOffset = canvasLeftOffset;
                const centerOffset = leftOffset + leftWidth;
                const rightOffset = leftOffset + leftWidth + centerWidth;
                return [
                    [
                        0,
                        leftOffset,
                        centerOffset,
                        leftOffset,
                        rightOffset,
                        leftOffset,
                        centerOffset,
                        leftOffset,
                    ], [
                        0,
                        leftWidth,
                        centerWidth,
                        leftWidth + centerWidth,
                        rightWidth,
                        leftWidth + centerWidth + rightWidth,
                        centerWidth + rightWidth,
                        leftWidth + centerWidth + rightWidth,
                    ]
                ];
            }
            else if (laneCount === 2) {
                const leftWidth = Math.floor(remainingWidth / 2);
                const rightWidth = remainingWidth - leftWidth;
                const leftOffset = canvasLeftOffset;
                const rightOffset = leftOffset + leftWidth;
                return [
                    [
                        0,
                        leftOffset,
                        leftOffset,
                        leftOffset,
                        rightOffset,
                        leftOffset,
                        leftOffset,
                        leftOffset,
                    ], [
                        0,
                        leftWidth,
                        leftWidth,
                        leftWidth,
                        rightWidth,
                        leftWidth + rightWidth,
                        leftWidth + rightWidth,
                        leftWidth + rightWidth,
                    ]
                ];
            }
            else {
                const offset = canvasLeftOffset;
                const width = remainingWidth;
                return [
                    [
                        0,
                        offset,
                        offset,
                        offset,
                        offset,
                        offset,
                        offset,
                        offset,
                    ], [
                        0,
                        width,
                        width,
                        width,
                        width,
                        width,
                        width,
                        width,
                    ]
                ];
            }
        }
        equals(other) {
            return (this.lineHeight === other.lineHeight
                && this.pixelRatio === other.pixelRatio
                && this.overviewRulerLanes === other.overviewRulerLanes
                && this.renderBorder === other.renderBorder
                && this.borderColor === other.borderColor
                && this.hideCursor === other.hideCursor
                && this.cursorColor === other.cursorColor
                && this.themeType === other.themeType
                && this.backgroundColor === other.backgroundColor
                && this.top === other.top
                && this.right === other.right
                && this.domWidth === other.domWidth
                && this.domHeight === other.domHeight
                && this.canvasWidth === other.canvasWidth
                && this.canvasHeight === other.canvasHeight);
        }
    }
    var Constants;
    (function (Constants) {
        Constants[Constants["MIN_DECORATION_HEIGHT"] = 6] = "MIN_DECORATION_HEIGHT";
    })(Constants || (Constants = {}));
    var OverviewRulerLane;
    (function (OverviewRulerLane) {
        OverviewRulerLane[OverviewRulerLane["Left"] = 1] = "Left";
        OverviewRulerLane[OverviewRulerLane["Center"] = 2] = "Center";
        OverviewRulerLane[OverviewRulerLane["Right"] = 4] = "Right";
        OverviewRulerLane[OverviewRulerLane["Full"] = 7] = "Full";
    })(OverviewRulerLane || (OverviewRulerLane = {}));
    class DecorationsOverviewRuler extends viewPart_1.ViewPart {
        constructor(context) {
            super(context);
            this._domNode = fastDomNode_1.createFastDomNode(document.createElement('canvas'));
            this._domNode.setClassName('decorationsOverviewRuler');
            this._domNode.setPosition('absolute');
            this._domNode.setLayerHinting(true);
            this._domNode.setAttribute('aria-hidden', 'true');
            this._updateSettings(false);
            this._tokensColorTrackerListener = modes_1.TokenizationRegistry.onDidChange((e) => {
                if (e.changedColorMap) {
                    this._updateSettings(true);
                }
            });
            this._cursorPositions = [];
        }
        dispose() {
            super.dispose();
            this._tokensColorTrackerListener.dispose();
        }
        _updateSettings(renderNow) {
            const newSettings = new Settings(this._context.configuration, this._context.theme);
            if (this._settings && this._settings.equals(newSettings)) {
                // nothing to do
                return false;
            }
            this._settings = newSettings;
            this._domNode.setTop(this._settings.top);
            this._domNode.setRight(this._settings.right);
            this._domNode.setWidth(this._settings.domWidth);
            this._domNode.setHeight(this._settings.domHeight);
            this._domNode.domNode.width = this._settings.canvasWidth;
            this._domNode.domNode.height = this._settings.canvasHeight;
            if (renderNow) {
                this._render();
            }
            return true;
        }
        // ---- begin view event handlers
        onConfigurationChanged(e) {
            return this._updateSettings(false);
        }
        onCursorStateChanged(e) {
            this._cursorPositions = [];
            for (let i = 0, len = e.selections.length; i < len; i++) {
                this._cursorPositions[i] = e.selections[i].getPosition();
            }
            this._cursorPositions.sort(position_1.Position.compare);
            return true;
        }
        onDecorationsChanged(e) {
            return true;
        }
        onFlushed(e) {
            return true;
        }
        onScrollChanged(e) {
            return e.scrollHeightChanged;
        }
        onZonesChanged(e) {
            return true;
        }
        onThemeChanged(e) {
            // invalidate color cache
            this._context.model.invalidateOverviewRulerColorCache();
            return this._updateSettings(false);
        }
        // ---- end view event handlers
        getDomNode() {
            return this._domNode.domNode;
        }
        prepareRender(ctx) {
            // Nothing to read
        }
        render(editorCtx) {
            this._render();
        }
        _render() {
            const canvasWidth = this._settings.canvasWidth;
            const canvasHeight = this._settings.canvasHeight;
            const lineHeight = this._settings.lineHeight;
            const viewLayout = this._context.viewLayout;
            const outerHeight = this._context.viewLayout.getScrollHeight();
            const heightRatio = canvasHeight / outerHeight;
            const decorations = this._context.model.getAllOverviewRulerDecorations(this._context.theme);
            const minDecorationHeight = (6 /* MIN_DECORATION_HEIGHT */ * this._settings.pixelRatio) | 0;
            const halfMinDecorationHeight = (minDecorationHeight / 2) | 0;
            const canvasCtx = this._domNode.domNode.getContext('2d');
            if (this._settings.backgroundColor === null) {
                canvasCtx.clearRect(0, 0, canvasWidth, canvasHeight);
            }
            else {
                canvasCtx.fillStyle = this._settings.backgroundColor;
                canvasCtx.fillRect(0, 0, canvasWidth, canvasHeight);
            }
            const x = this._settings.x;
            const w = this._settings.w;
            // Avoid flickering by always rendering the colors in the same order
            // colors that don't use transparency will be sorted last (they start with #)
            const colors = Object.keys(decorations);
            colors.sort();
            for (let cIndex = 0, cLen = colors.length; cIndex < cLen; cIndex++) {
                const color = colors[cIndex];
                const colorDecorations = decorations[color];
                canvasCtx.fillStyle = color;
                let prevLane = 0;
                let prevY1 = 0;
                let prevY2 = 0;
                for (let i = 0, len = colorDecorations.length; i < len; i++) {
                    const lane = colorDecorations[3 * i];
                    const startLineNumber = colorDecorations[3 * i + 1];
                    const endLineNumber = colorDecorations[3 * i + 2];
                    let y1 = (viewLayout.getVerticalOffsetForLineNumber(startLineNumber) * heightRatio) | 0;
                    let y2 = ((viewLayout.getVerticalOffsetForLineNumber(endLineNumber) + lineHeight) * heightRatio) | 0;
                    const height = y2 - y1;
                    if (height < minDecorationHeight) {
                        let yCenter = ((y1 + y2) / 2) | 0;
                        if (yCenter < halfMinDecorationHeight) {
                            yCenter = halfMinDecorationHeight;
                        }
                        else if (yCenter + halfMinDecorationHeight > canvasHeight) {
                            yCenter = canvasHeight - halfMinDecorationHeight;
                        }
                        y1 = yCenter - halfMinDecorationHeight;
                        y2 = yCenter + halfMinDecorationHeight;
                    }
                    if (y1 > prevY2 + 1 || lane !== prevLane) {
                        // flush prev
                        if (i !== 0) {
                            canvasCtx.fillRect(x[prevLane], prevY1, w[prevLane], prevY2 - prevY1);
                        }
                        prevLane = lane;
                        prevY1 = y1;
                        prevY2 = y2;
                    }
                    else {
                        // merge into prev
                        if (y2 > prevY2) {
                            prevY2 = y2;
                        }
                    }
                }
                canvasCtx.fillRect(x[prevLane], prevY1, w[prevLane], prevY2 - prevY1);
            }
            // Draw cursors
            if (!this._settings.hideCursor && this._settings.cursorColor) {
                const cursorHeight = (2 * this._settings.pixelRatio) | 0;
                const halfCursorHeight = (cursorHeight / 2) | 0;
                const cursorX = this._settings.x[7 /* Full */];
                const cursorW = this._settings.w[7 /* Full */];
                canvasCtx.fillStyle = this._settings.cursorColor;
                let prevY1 = -100;
                let prevY2 = -100;
                for (let i = 0, len = this._cursorPositions.length; i < len; i++) {
                    const cursor = this._cursorPositions[i];
                    let yCenter = (viewLayout.getVerticalOffsetForLineNumber(cursor.lineNumber) * heightRatio) | 0;
                    if (yCenter < halfCursorHeight) {
                        yCenter = halfCursorHeight;
                    }
                    else if (yCenter + halfCursorHeight > canvasHeight) {
                        yCenter = canvasHeight - halfCursorHeight;
                    }
                    const y1 = yCenter - halfCursorHeight;
                    const y2 = y1 + cursorHeight;
                    if (y1 > prevY2 + 1) {
                        // flush prev
                        if (i !== 0) {
                            canvasCtx.fillRect(cursorX, prevY1, cursorW, prevY2 - prevY1);
                        }
                        prevY1 = y1;
                        prevY2 = y2;
                    }
                    else {
                        // merge into prev
                        if (y2 > prevY2) {
                            prevY2 = y2;
                        }
                    }
                }
                canvasCtx.fillRect(cursorX, prevY1, cursorW, prevY2 - prevY1);
            }
            if (this._settings.renderBorder && this._settings.borderColor && this._settings.overviewRulerLanes > 0) {
                canvasCtx.beginPath();
                canvasCtx.lineWidth = 1;
                canvasCtx.strokeStyle = this._settings.borderColor;
                canvasCtx.moveTo(0, 0);
                canvasCtx.lineTo(0, canvasHeight);
                canvasCtx.stroke();
                canvasCtx.moveTo(0, 0);
                canvasCtx.lineTo(canvasWidth, 0);
                canvasCtx.stroke();
            }
        }
    }
    exports.DecorationsOverviewRuler = DecorationsOverviewRuler;
});
//# sourceMappingURL=decorationsOverviewRuler.js.map