/*!
 * ${copyright}
 */
sap.ui.define(["jquery.sap.global", "sap/ui/Device", "../UIArea"],
	function(jQuery, Device, UIArea) {
	"use strict";

	var DnD = {},
		oDragControl = null,		// the control being dragged
		oDropControl = null,		// the current drop target control
		oValidDropControl = null,	// the control which the dragged control can be dropped on based on the valid drop info
		aValidDragInfos = [],		// valid DragInfos configured for the currently dragged source
		aValidDropInfos = [],		// valid DropInfos configured for the current drop target
		oDragSession = null,		// stores active drag session throughout a drag activity
		$DropIndicator,				// drop position indicator
		$GhostContainer,			// container to place custom ghosts
		sCalculatedDropPosition,	// calculated position of the drop action relative to the valid dropped control.
		iTargetEnteringTime;		// timestamp of drag enter


	function addStyleClass(oElement, sStyleClass) {
		if (!oElement) {
			return;
		}

		if (oElement.addStyleClass) {
			oElement.addStyleClass(sStyleClass);
		} else {
			oElement.$().addClass(sStyleClass);
		}
	}

	function removeStyleClass(oElement, sStyleClass) {
		if (!oElement) {
			return;
		}

		if (oElement.removeStyleClass) {
			oElement.removeStyleClass(sStyleClass);
		} else {
			oElement.$().removeClass(sStyleClass);
		}
	}

	function dispatchEvent(oEvent, sEventName) {
		var oControl = jQuery(oEvent.target).control(0, true);
		if (!oControl) {
			return;
		}

		var oNewEvent = jQuery.Event(null, oEvent);
		oNewEvent.type = sEventName;
		oControl.getUIArea()._handleEvent(oNewEvent);
	}

	function setDragGhost(oDragControl, oEvent) {
		if (Device.browser.msie || !oDragControl || !oDragControl.getDragGhost) {
			return;
		}

		var oDragGhost = oDragControl.getDragGhost();
		if (!oDragGhost) {
			return;
		}

		if (!$GhostContainer) {
			$GhostContainer = jQuery('<div class="sapUiDnDGhostContainer"></div>');
			jQuery(document.body).append($GhostContainer);
		}

		$GhostContainer.append(oDragGhost);
		window.setTimeout(function() { $GhostContainer.empty(); }, 0);

		var oOriginalEvent = oEvent.originalEvent;
		oOriginalEvent.dataTransfer.setDragImage(oDragGhost, oOriginalEvent.offsetX, oOriginalEvent.offsetY);
	}

	function createDragSession(oEvent) {
		var mData = {},
			mIndicatorConfig,
			oDataTransfer = oEvent.originalEvent.dataTransfer,
			setTransferData = function(sType, sData) {
				// set to original dataTransfer object if type is supported by the current browser (non-text causes error in IE+Edge)
				if (oDataTransfer && sType == "text" || (Device.browser != "msie" && Device.browser != "edge")) {
					oDataTransfer.setData(sType, sData);
				}
			};

		/**
		 * When a user requests to drag some controls that can be dragged, a drag session is started.
		 * The drag session can be used to transfer data between applications or between dragged and dropped controls.
		 * Please see provided APIs for more details.
		 *
		 * <b>Note:</b> This object only exists during a drag-and-drop operation.
		 *
		 * @namespace
		 * @name sap.ui.core.dnd.DragSession
		 * @static
		 * @abstract
		 * @public
		 */
		return /** @lends sap.ui.core.dnd.DragSession */ {
			/**
			 * Sets string data with any MIME type.
			 * <b>Note:</b> This works in all browsers, apart from Internet Explorer and Microsoft Edge. It also works if you navigate between
			 * different windows.
			 *
			 * @param {string} sKey The key of the data
			 * @param {string} sData Data
			 * @public
			 */
			setData: function(sKey, sData) {
				sData = "" + sData;
				mData[sKey] = sData;
				setTransferData(sKey, sData);
			},

			/**
			 * Returns the data that has been set via <code>setData</code> method.
			 *
			 * @param {string} sKey The key of the data
			 * @returns {string} Data
			 * @public
			 */
			getData: function(sKey) {
				return mData[sKey];
			},

			/**
			 * Sets string data with plain text MIME type.
			 * <b>Note:</b> This works in all browsers, including Internet Explorer and Microsoft Edge. It also works if you navigate between
			 * different windows.
			 *
			 * @param {string} sData Data
			 * @public
			 */
			setTextData: function(sData) {
				sData = "" + sData;
				mData["text/plain"] = sData;
				mData["text"] = sData;
				setTransferData("text/plain", sData);
				setTransferData("text", sData);
			},

			/**
			 * Returns the data that has been set via <code>setTextData</code> method.
			 *
			 * @returns {string} Data
			 * @public
			 */
			getTextData: function() {
				return mData["text/plain"];
			},

			/**
			 * Sets any type of data (even functions, pointers, anything non-serializable) with any MIME type.
			 * This works in all browsers, including Internet Explorer and Microsoft Edge, but only within a UI5 application within the same
			 * window/frame.
			 *
			 * @param {string} sKey The key of the data
			 * @param {any} vData Data
			 */
			setComplexData: function(sKey, vData) {
				mData[sKey] = vData;
			},

			/**
			 * Returns the data that has been set via <code>setComplexData</code> method.
			 *
			 * @param {string} sKey The key of the data
			 * @returns {any} The previously set data or undefined
			 * @public
			 */
			getComplexData: function(sKey) {
				return mData[sKey];
			},

			/**
			 * Returns the drop indicator.
			 *
			 * @returns {HTMLElement|null} Drop indicator's DOM reference
			 * @protected
			 */
			getIndicator: function() {
				return $DropIndicator && $DropIndicator[0];
			},

			/**
			 * Defines the visual configuration of the drop indicator for the current <code>DropInfo</code>.
			 *
			 * @param {object} mConfig Custom styles of the drop indicator.
			 * @protected
			 */
			setIndicatorConfig: function(mConfig) {
				mIndicatorConfig = mConfig;
			},

			/**
			 * Returns the visual configuration of the drop indicator.
			 *
			 * @returns {object} Drop indicator configuration
			 * @protected
			 */
			getIndicatorConfig: function(mConfig) {
				return mIndicatorConfig;
			},

			/**
			 * Returns the dragged control, if available within the same UI5 application frame.
			 *
			 * @returns {sap.ui.core.Element|null}
			 * @protected
			 */
			getDragControl: function() {
				return oDragControl;
			},

			/**
			 * The valid drop target underneath the dragged control.
			 *
			 * @returns {sap.ui.core.Element|null}
			 * @protected
			 */
			getDropControl: function() {
				return oValidDropControl;
			},

			/**
			 * Set the valid drop control.
			 *
			 * @protected
			 */
			setDropControl: function(oControl) {
				oValidDropControl = oControl;
			},

			/**
			 * Returns the calculated position of the drop action relative to the valid dropped control.
			 *
			 * @returns {String}
			 * @protected
			 */
			getDropPosition: function() {
				return sCalculatedDropPosition;
			}
		};
	}

	function closeDragSession(oEvent) {
		hideDropIndicator();
		removeStyleClass(oDragControl, "sapUiDnDDragging");
		oDragControl = oDropControl = oValidDropControl = oDragSession = null;
		sCalculatedDropPosition = "";
		aValidDragInfos = [];
		aValidDropInfos = [];
	}

	function getDropIndicator() {
		if ($DropIndicator) {
			return $DropIndicator;
		}

		$DropIndicator = jQuery("<div class='sapUiDnDIndicator'></div>");
		jQuery(sap.ui.getCore().getStaticAreaRef()).append($DropIndicator);
		return $DropIndicator;
	}

	function hideDropIndicator() {
		if ($DropIndicator) {
			$DropIndicator.removeAttr("style").hide();
		}
	}

	function showDropIndicator(oEvent, oDropTarget, sDropPosition, sDropLayout) {
		if (!oDropTarget) {
			return;
		}

		var mIndicatorConfig = oEvent.dragSession && oEvent.dragSession.getIndicatorConfig(),
			mClientRect = oDropTarget.getBoundingClientRect(),
			iPageYOffset = window.pageYOffset,
			iPageXOffset = window.pageXOffset,
			$Indicator = getDropIndicator(),
			sRelativePosition,
			mDropRect = jQuery.extend({
				top: mClientRect.top + iPageYOffset,
				bottom: mClientRect.bottom + iPageYOffset,
				left: mClientRect.left + iPageXOffset,
				right: mClientRect.right + iPageXOffset,
				width: mClientRect.width,
				height: mClientRect.height
			}, mIndicatorConfig);

		if (!sDropPosition || sDropPosition == "On") {
			sRelativePosition = "On";
		} else if (sDropLayout == "Horizontal") {
			var iCursorX = oEvent.pageX - mDropRect.left;
			$Indicator.attr("data-drop-layout", "horizontal").css({
				height: mDropRect.height,
				top: mDropRect.top
			});

			if (sDropPosition == "Between") {
				$Indicator.attr("data-drop-position", "between").css("width", "");
				if (iCursorX < mDropRect.width * 0.5) {
					sRelativePosition = "Before";
					$Indicator.css("left", mDropRect.left);
				} else {
					sRelativePosition = "After";
					$Indicator.css("left", mDropRect.right);
				}
			} else if (sDropPosition == "OnOrBetween") {
				if (iCursorX < mDropRect.width * 0.25) {
					sRelativePosition = "Before";
					$Indicator.attr("data-drop-position", "between").css({
						left: mDropRect.left,
						width: ""
					});
				} else if (iCursorX > mDropRect.width * 0.75) {
					sRelativePosition = "After";
					$Indicator.attr("data-drop-position", "between").css({
						left: mDropRect.right,
						width: ""
					});
				} else {
					sRelativePosition = "On";
				}
			}
		} else {
			var iCursorY = oEvent.pageY - mDropRect.top;
			$Indicator.attr("data-drop-layout", "vertical").css({
				width: mDropRect.width,
				left: mDropRect.left
			});

			if (sDropPosition == "Between") {
				$Indicator.attr("data-drop-position", "between").css("height", "");
				if (iCursorY < mDropRect.height * 0.5) {
					sRelativePosition = "Before";
					$Indicator.css("top", mDropRect.top);
				} else {
					sRelativePosition = "After";
					$Indicator.css("top", mDropRect.bottom);
				}
			} else if (sDropPosition == "OnOrBetween") {
				if (iCursorY < mDropRect.height * 0.25) {
					sRelativePosition = "Before";
					$Indicator.attr("data-drop-position", "between").css({
						top: mDropRect.top,
						height: ""
					});
				} else if (iCursorY > mDropRect.height * 0.75) {
					sRelativePosition = "After";
					$Indicator.attr("data-drop-position", "between").css({
						top: mDropRect.bottom,
						height: ""
					});
				} else {
					sRelativePosition = "On";
				}
			}
		}

		if (sRelativePosition == "On") {
			$Indicator.attr("data-drop-position", "on").css({
				top: mDropRect.top,
				left: mDropRect.left,
				width: mDropRect.width,
				height: mDropRect.height
			});
		}

		if (sRelativePosition) {
			$Indicator.show();
		}

		return sRelativePosition;
	}

	function getDragDropConfigs(oControl) {
		var oParent = oControl.getParent(),
			aSelfConfigs = (oControl.getDragDropConfig) ? oControl.getDragDropConfig() : [],
			aParentConfigs = (oParent && oParent.getDragDropConfig) ? oParent.getDragDropConfig() : [];

		return aSelfConfigs.concat(aParentConfigs);
	}

	function getValidDragInfos(oDragControl) {
		var aDragDropConfigs = getDragDropConfigs(oDragControl);
		return aDragDropConfigs.filter(function(oDragOrDropInfo) {
			return oDragOrDropInfo.isDraggable(oDragControl);
		});
	}

	function getValidDropInfos(oDropControl, aDragInfos, oEvent) {
		var aDragDropConfigs = getDragDropConfigs(oDropControl);
		aDragInfos = aDragInfos || [];

		return aDragDropConfigs.filter(function(oDragOrDropInfo) {
			// DragDropInfo defined at the drop target is irrelevant we only need DropInfos
			return !oDragOrDropInfo.getMetadata().isInstanceOf("sap.ui.core.dnd.IDragInfo");
		}).concat(aDragInfos).filter(function(oDropInfo) {
			if (!oDropInfo.isDroppable(oDropControl, oEvent)) {
				return false;
			}

			// master group matches always
			var sDropGroupName = oDropInfo.getGroupName();
			if (!sDropGroupName) {
				return true;
			}

			// group name matching
			return aDragInfos.some(function(oDragInfo) {
				return oDragInfo.getGroupName() == sDropGroupName;
			});
		});
	}

	function setDropEffect(oEvent, oDropInfo) {
		// hide the drop indicator if there is no drop info
		if (!oDropInfo || oDropInfo.getDropEffect() == "None") {
			hideDropIndicator();
			return;
		}

		// allow dropping
		oEvent.preventDefault();

		// set visual drop indicator from drop info
		var sDropEffect = oDropInfo.getDropEffect().toLowerCase();
		oEvent.originalEvent.dataTransfer.dropEffect = sDropEffect;
	}

	function showDropPosition(oEvent, oDropInfo, oValidDropControl) {
		// we need valid drop info and control
		if (!oDropInfo || !oValidDropControl) {
			return;
		}

		// no target aggregation so entire control is the target
		var sTargetAggregation = oDropInfo.getTargetAggregation();
		if (!sTargetAggregation) {
			return showDropIndicator(oEvent, oValidDropControl.getDomRef());
		}

		// whether the current DOM element corresponds to the configured aggregation
		var oTargetDomRef, sDropPosition = oDropInfo.getDropPosition();
		if (oValidDropControl.getAggregationDomRef) {
			var oAggregationDomRef = oValidDropControl.getAggregationDomRef(sTargetAggregation);
			if (oAggregationDomRef && oAggregationDomRef.contains(oEvent.target)) {
				oTargetDomRef = oAggregationDomRef;
				sDropPosition = "On";
			}
		}

		// not dragging over an aggregated child of the element
		if (!oTargetDomRef) {
			oTargetDomRef = oValidDropControl.getDomRef();
		}

		// let the user know the drop position
		return showDropIndicator(oEvent, oTargetDomRef, sDropPosition, oDropInfo.getDropLayout());
	}

	// before controls handle UIArea events
	DnD.preprocessEvent = function(oEvent) {
		if (oDragSession && oEvent.type.indexOf("dr") == 0) {
			// attach dragSession to all drag events
			oEvent.dragSession = oDragSession;
		}

		var sEventHandler = "onbefore" + oEvent.type;
		if (DnD[sEventHandler]) {
			DnD[sEventHandler](oEvent);
		}
	};

	// after controls handle UIArea events
	DnD.postprocessEvent = function(oEvent) {
		var sEventHandler = "onafter" + oEvent.type;
		if (DnD[sEventHandler]) {
			DnD[sEventHandler](oEvent);
		}
	};

	DnD.onbeforedragstart = function(oEvent) {
		// draggable implicitly
		if (!oEvent.target.draggable) {
			return;
		}

		// the text inside input fields should still be selectable
		if (/^(input|textarea)$/i.test(document.activeElement.tagName)) {
			return;
		}

		// identify the control being dragged
		oDragControl = jQuery(oEvent.target).control(0, true);
		if (!oDragControl) {
			return;
		}

		// identify and remember the applicable DragInfos
		aValidDragInfos = getValidDragInfos(oDragControl);
		if (!aValidDragInfos.length) {
			return;
		}

		// create the drag session object and attach to the event
		oEvent.dragSession = oDragSession = createDragSession(oEvent);
	};

	DnD.onafterdragstart = function(oEvent) {
		// drag is not possible if preventDefault is called for dragstart event
		if (!aValidDragInfos.length || oEvent.isDefaultPrevented()) {
			closeDragSession();
			return;
		}

		// fire dragstart event of valid DragInfos and filter if preventDefault is called
		aValidDragInfos = oEvent.isMarked("NonDraggable") ? [] : aValidDragInfos.filter(function(oDragInfo) {
			return oDragInfo.fireDragStart(oEvent);
		});

		// check whether drag is possible
		if (!aValidDragInfos.length) {
			oEvent.preventDefault();
			closeDragSession();
			return;
		}

		// set custom drag ghost
		setDragGhost(oDragControl, oEvent);

		// set dragging class of the drag source
		addStyleClass(oDragControl, "sapUiDnDDragging");
	};

	DnD.onbeforedragenter = function(oEvent) {
		// check whether we remain within the same control
		var oControl = jQuery(oEvent.target).control(0, true);
		if (oControl && oDropControl === oControl) {
			oEvent.setMark("DragWithin", "SameControl");
		} else {
			iTargetEnteringTime = Date.now();
		}

		oDropControl = oControl;
		oValidDropControl = oControl;
		var oValidDropInfo = aValidDropInfos[0];

		// find the first valid drop control and corresponding valid DropInfos at the control hierarchy
		for (var i = 0; i < 10 && oValidDropControl; i++, oValidDropControl = oValidDropControl.getParent()) {
			aValidDropInfos = getValidDropInfos(oValidDropControl, aValidDragInfos, oEvent);
			if (aValidDropInfos.length) {
				break;
			}
		}

		// if valid drop info is changed, clear indicator config
		if (oValidDropInfo != aValidDropInfos[0] && oDragSession) {
			oDragSession.setIndicatorConfig(null);
		}

		// no valid drop info found
		if (!aValidDropInfos.length) {
			oValidDropControl = null;
		} else if (!oDragSession) {
			// something is dragged from outside the browser
			oEvent.dragSession = oDragSession = createDragSession(oEvent);
		}
	};

	DnD.onafterdragenter = function(oEvent) {
		// drop is not possible if there is no valid drop control or dragenter event is marked as NonDroppable
		if (!oValidDropControl || oEvent.isMarked("NonDroppable")) {
			aValidDropInfos = [];
		} else if (oEvent.getMark("DragWithin") != "SameControl") {
			// fire dragenter event of valid DropInfos and filter if preventDefault is called
			aValidDropInfos = aValidDropInfos.filter(function(oDropInfo) {
				return oDropInfo.fireDragEnter(oEvent);
			});
		}

		// set drop effect and show drop position
		var oValidDropInfo = aValidDropInfos[0];
		setDropEffect(oEvent, oValidDropInfo);
		sCalculatedDropPosition = showDropPosition(oEvent, oValidDropInfo, oValidDropControl);
	};

	DnD.onbeforedragover = function(oEvent) {
		// handle longdragover event
		var iCurrentTime = Date.now();
		if (iCurrentTime - iTargetEnteringTime >= 1000) {
			dispatchEvent(oEvent, "longdragover");
			iTargetEnteringTime = iCurrentTime;
		}
	};

	DnD.onafterdragover = function(oEvent) {
		var oValidDropInfo = aValidDropInfos[0];

		// browsers drop effect must be set on dragover always
		setDropEffect(oEvent, oValidDropInfo);

		// drop position is set already at dragenter it should not be changed for DropPosition=On
		if (oValidDropInfo && oValidDropInfo.getDropPosition() == "On") {
			return;
		}

		// drop indicator position may change depending on the mouse pointer location
		sCalculatedDropPosition = showDropPosition(oEvent, oValidDropInfo, oValidDropControl);
	};

	DnD.onafterdrop = function(oEvent) {
		// finally fire drop events of valid DropInfos
		aValidDropInfos.forEach(function(oDropInfo) {
			return oDropInfo.fireDrop(oEvent);
		});

		// finalize drag session
		closeDragSession();
	};

	DnD.onafterdragend = function(oEvent) {
		// finalize drag session
		closeDragSession();
	};

	// process the events of the UIArea
	UIArea.addEventPreprocessor(DnD.preprocessEvent);
	UIArea.addEventPostprocessor(DnD.postprocessEvent);

	return DnD;

}, /* bExport= */ true);