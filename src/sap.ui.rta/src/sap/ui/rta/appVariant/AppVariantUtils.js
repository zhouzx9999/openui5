/*!
 * ${copyright}
 */
sap.ui.define([
	"sap/ui/fl/descriptorRelated/api/DescriptorVariantFactory",
	"sap/ui/fl/descriptorRelated/api/DescriptorInlineChangeFactory",
	"sap/ui/fl/Utils",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/ui/rta/Utils",
	"sap/ui/fl/descriptorRelated/internal/Utils",
	"sap/ui/fl/transport/TransportSelection",
	"sap/ui/fl/transport/Transports",
	"sap/base/util/uid",
	"sap/base/Log",
	"sap/ui/thirdparty/hasher"
],
	function(
		DescriptorVariantFactory,
		DescriptorInlineChangeFactory,
		FlexUtils,
		MessageBox,
		MessageToast,
		RtaUtils,
		DescriptorUtils,
		TransportSelection,
		Transports,
		uid,
		Log,
		hasher
	) {

		"use strict";
		var AppVariantUtils = {};

		// S/4Hana Cloud Platform expects an ID of 56 characters
		var HANA_CLOUD_ID_LENGTH = 56;

		AppVariantUtils._newAppVariantId = null;

		AppVariantUtils.getManifirstSupport = function(sRunningAppId) {
	        var sRoute = '/sap/bc/ui2/app_index/ui5_app_mani_first_supported/?id=' + sRunningAppId;
			return DescriptorUtils.sendRequest(sRoute, 'GET');
		};

		AppVariantUtils.isStandAloneApp = function() {
			if (sap.ushell_abap) {
				return false;
			} else {
				return true;
			}
		};

		AppVariantUtils.getNewAppVariantId = function() {
			return AppVariantUtils._newAppVariantId;
		};

		AppVariantUtils.setNewAppVariantId = function(sNewAppVariantID) {
			AppVariantUtils._newAppVariantId = sNewAppVariantID;
		};

		AppVariantUtils.trimIdIfRequired = function(sId) {
			return sId.substr(0, HANA_CLOUD_ID_LENGTH);
		};

		AppVariantUtils.getId = function(sBaseAppID) {
			var sChangedId;
			var aIdStrings = sBaseAppID.split('.');

			if (aIdStrings[0] !== "customer") {
				aIdStrings[0] = "customer." + aIdStrings[0];
			}

			var bRegFound = false;
			var regex = /^id.*/i;

			aIdStrings.forEach(function(sString, index, array) {
				if (sString.match(regex)) {
					sString = sString.replace(regex, uid().replace(/-/g, "_"));
					array[index] = sString;
					bRegFound = true;
				}
			});

			sChangedId = aIdStrings.join(".");
			if (!bRegFound) {
				sChangedId = sChangedId + "." + uid().replace(/-/g, "_");
			}

			sChangedId = this.trimIdIfRequired(sChangedId);
			this.setNewAppVariantId(sChangedId);

			return sChangedId;
		};

		AppVariantUtils.createDescriptorVariant = function(mParameters){
			mParameters.layer = FlexUtils.getCurrentLayer(false);
			return DescriptorVariantFactory.createNew(mParameters);
		};

		AppVariantUtils.getInlineChangeInput = function(sValue, sComment){
			return {
				"type": "XTIT",
				"maxLength": 50,
				"comment": sComment,
				"value": {
					"": sValue
				}
			};
		};

		AppVariantUtils.getInlinePropertyChange = function(sPropertyName, sPropertyValue){
			var sComment = "New " + sPropertyName + " entered by a key user via RTA tool";
			return this.getInlineChangeInput(sPropertyValue, sComment);
		};

		AppVariantUtils.getInlineChangeInputIcon = function(sIconValue) {
			return {
				icon: sIconValue
			};
		};

		AppVariantUtils.getInlineChangeRemoveInbounds = function(sInboundValue) {
			return {
				"inboundId": sInboundValue
			};
		};

		AppVariantUtils.getURLParsedHash = function() {
			var oURLParser = sap.ushell.Container.getService("URLParsing");
			if (oURLParser.parseShellHash && oURLParser.getHash){
				return oURLParser.parseShellHash(hasher.getHash());
			}
		};

		AppVariantUtils.getInboundInfo = function(oInbounds) {
			var oInboundInfo = {};
			if (!oInbounds) {
				oInboundInfo.currentRunningInbound = "customer.savedAsAppVariant";
				oInboundInfo.addNewInboundRequired = true;
				return oInboundInfo;
			}

			var oParsedHash = this.getURLParsedHash();
			var aInbounds = Object.keys(oInbounds);
			var aInboundsFound = [];

			aInbounds.forEach(function(sInboundId) {
				if ((oInbounds[sInboundId].action === oParsedHash.action) && (oInbounds[sInboundId].semanticObject === oParsedHash.semanticObject)) {
					aInboundsFound.push(sInboundId);
				}
			});

			switch (aInboundsFound.length) {
				case 0:
					oInboundInfo.currentRunningInbound = "customer.savedAsAppVariant";
					oInboundInfo.addNewInboundRequired = true;
					break;
				case 1:
					oInboundInfo.currentRunningInbound = aInboundsFound[0];
					oInboundInfo.addNewInboundRequired = false;
					break;
				default:
					oInboundInfo = undefined;
					break;
			}

			return oInboundInfo;
		};

		AppVariantUtils.getInboundPropertiesKey = function(sAppVariantId, sCurrentRunningInboundId, sPropertyName) {
			return sAppVariantId + "_sap.app.crossNavigation.inbounds." + sCurrentRunningInboundId + "." + sPropertyName;
		};

		AppVariantUtils.getInlineChangesForInboundProperties = function(sCurrentRunningInboundId, sAppVariantId, sPropertyName, sPropertyValue) {
			var oChangeInput = {
				"inboundId": sCurrentRunningInboundId,
				"entityPropertyChange": {
					"propertyPath": sPropertyName,
					"operation": "UPSERT",
					"propertyValue": {}
				},
				"texts": {}
			};

			if (sPropertyName === "title" || sPropertyName === "subTitle") {
				var sKey = this.getInboundPropertiesKey(sAppVariantId, sCurrentRunningInboundId, sPropertyName);
				oChangeInput.entityPropertyChange.propertyValue = "{{" + sKey + "}}";
				oChangeInput.texts[sKey] = this.getInlinePropertyChange(sPropertyName, sPropertyValue);
			} else if (sPropertyName === "icon") {
				oChangeInput.entityPropertyChange.propertyValue = sPropertyValue;
			}

			return oChangeInput;
		};

		AppVariantUtils.getInlineChangeForInboundPropertySaveAs = function(sCurrentRunningInboundId) {
			return {
				"inboundId": sCurrentRunningInboundId,
				"entityPropertyChange": {
					"propertyPath": "signature/parameters/sap-appvar-id",
					"operation": "UPSERT",
					"propertyValue": {
						"required": true,
						"filter": {
							"value": this.getNewAppVariantId(),
							"format": "plain"
						},
						"launcherValue": {
							"value": this.getNewAppVariantId()
						}
					}
				}
			};
		};

		AppVariantUtils.getInlineChangeCreateInbound = function(sCurrentRunningInboundId) {
			var oParsedHash = this.getURLParsedHash();
			var oProperty = {
				"inbound": {}
			};

			oProperty.inbound[sCurrentRunningInboundId] = {
				"semanticObject": oParsedHash.semanticObject,
                "action": oParsedHash.action
			};

			return oProperty;
		};

		AppVariantUtils.createInlineChange = function(mParameters, sChange){
			var mTexts;
			if (sChange === "title"){
				return DescriptorInlineChangeFactory.create_app_setTitle(mParameters);
			} else if (sChange === "description" ){
				return DescriptorInlineChangeFactory.create_app_setDescription(mParameters);
			} else if (sChange === "subtitle" ){
				return DescriptorInlineChangeFactory.create_app_setSubTitle(mParameters);
			} else if (sChange === "icon" ){
				return DescriptorInlineChangeFactory.create_ui_setIcon(mParameters);
			} else if (sChange === "inbound" ){
				return DescriptorInlineChangeFactory.create_app_changeInbound(mParameters);
			} else if (sChange === "createInbound" ){
				return DescriptorInlineChangeFactory.create_app_addNewInbound(mParameters);
			} else if (sChange === "inboundTitle" ){
				mTexts = mParameters.texts;
				delete mParameters.texts;
				return DescriptorInlineChangeFactory.create_app_changeInbound(mParameters, mTexts);
			} else if (sChange === "inboundSubtitle" ){
				mTexts = mParameters.texts;
				delete mParameters.texts;
				return DescriptorInlineChangeFactory.create_app_changeInbound(mParameters, mTexts);
			} else if (sChange === "inboundIcon" ){
				delete mParameters.texts;
				return DescriptorInlineChangeFactory.create_app_changeInbound(mParameters);
			} else if (sChange === "removeInbound"){
				return DescriptorInlineChangeFactory.create_app_removeAllInboundsExceptOne(mParameters);
			}
		};

		AppVariantUtils.getTransportInput = function(sPackageName, sNameSpace, sName, sType) {
			return {
				getPackage : function(){
					return sPackageName;
				},
				getNamespace : function(){
					return sNameSpace;
				},
				getId : function(){
					return sName;
				},
				getDefinition : function(){
					return {
						fileType: sType
					};
				}
			};
		};

		AppVariantUtils.triggerCatalogAssignment = function(sAppVariantId, sOriginalId) {
			var sRoute = '/sap/bc/lrep/appdescr_variants/' + sAppVariantId + '?action=assignCatalogs&assignFromAppId=' + sOriginalId;
			return DescriptorUtils.sendRequest(sRoute, 'POST');
		};

		AppVariantUtils.isS4HanaCloud = function(oSettings) {
			return oSettings.isAtoEnabled() && oSettings.isAtoAvailable();
		};

		AppVariantUtils.copyId = function(sId) {
			var textArea = document.createElement("textarea");
			textArea.value = sId;
			document.body.appendChild(textArea);
			textArea.select();

			document.execCommand('copy');
			document.body.removeChild(textArea);

			return true;
		};

		AppVariantUtils.getTextResources = function() {
			return sap.ui.getCore().getLibraryResourceBundle("sap.ui.rta");
		};

		AppVariantUtils.getText = function(sMessageKey, sText) {
			var oTextResources = this.getTextResources();
			return sText ? oTextResources.getText(sMessageKey, sText) : oTextResources.getText(sMessageKey);
		};

		AppVariantUtils._getErrorMessageText = function(oError) {
			var sErrorMessage;

			if (oError.messages && oError.messages.length) {
				sErrorMessage = oError.messages.map(function(oError) {
					return oError.text;
				}).join("\n");
			} else if (oError.iamAppId) {
				sErrorMessage = "IAM App Id: " + oError.iamAppId;
			} else {
				sErrorMessage = oError.stack || oError.message || oError.status || oError;
			}

			return sErrorMessage;
		};

		AppVariantUtils.buildErrorInfo = function(sMessageKey, oError, sAppVariantId) {
			var sErrorMessage = this._getErrorMessageText(oError);
			var sMessage = AppVariantUtils.getText(sMessageKey) + "\n\n";

			if (sAppVariantId) {
				sMessage += AppVariantUtils.getText("MSG_APP_VARIANT_ID", sAppVariantId) + "\n";
			}

			sMessage += AppVariantUtils.getText("MSG_TECHNICAL_ERROR", sErrorMessage);
			Log.error("App variant error: ", sErrorMessage);

			return {
				text: sMessage,
				appVariantId: sAppVariantId
			};
		};

		AppVariantUtils.showRelevantDialog = function(oInfo, bSuccessful) {
			var sTitle,
				sRightButtonText,
				sOKButtonText,
				sCopyIdButtonText,
				aActions = [];

			if (bSuccessful) {
				sTitle = this.getText("SAVE_APP_VARIANT_SUCCESS_MESSAGE_TITLE");
				sRightButtonText = this.getText("SAVE_APP_VARIANT_OK_TEXT");
			} else {
				sTitle = this.getText("HEADER_SAVE_APP_VARIANT_FAILED");
				sRightButtonText = this.getText("SAVE_APP_VARIANT_CLOSE_TEXT");
			}

			if (oInfo && oInfo.copyId) {
				sCopyIdButtonText = this.getText("SAVE_APP_VARIANT_COPY_ID_TEXT");
				aActions.push(sCopyIdButtonText);
			} else if (oInfo && oInfo.deleteAppVariant) {
				sTitle = this.getText("DELETE_APP_VARIANT_INFO_MESSAGE_TITLE");
				sOKButtonText = this.getText("DELETE_APP_VARIANT_OK_TEXT");
				aActions.push(sOKButtonText);
				sRightButtonText = this.getText("DELETE_APP_VARIANT_CLOSE_TEXT");
			}

			aActions.push(sRightButtonText);

			return new Promise(function(resolve, reject) {
				var fnCallback = function (sAction) {
					if (bSuccessful && sAction === sRightButtonText) {
						resolve();
					} else if (bSuccessful && sAction === sCopyIdButtonText) {
						AppVariantUtils.copyId(oInfo.appVariantId);
						resolve();
					} else if (oInfo.overviewDialog && sAction === sRightButtonText) {
						resolve(false);
					} else if (oInfo.deleteAppVariant && sAction === sOKButtonText) {
						resolve();
					} else if (oInfo.deleteAppVariant && sAction === sRightButtonText) {
						reject();
					} else if (sAction === sRightButtonText) {
						reject();
					} else if (sAction === sCopyIdButtonText) {
						AppVariantUtils.copyId(oInfo.appVariantId);
						reject();
					}
				};

				MessageBox.show(oInfo.text, {
					icon: (bSuccessful || oInfo.deleteAppVariant) ? MessageBox.Icon.INFORMATION : MessageBox.Icon.ERROR,
					onClose : fnCallback,
					title: sTitle,
					actions: aActions,
					styleClass: RtaUtils.getRtaStyleClassName()
				});
			});
		};

		AppVariantUtils.publishEventBus = function() {
			sap.ui.getCore().getEventBus().publish("sap.ui.rta.appVariant.manageApps.controller.ManageApps", "navigate");
		};

		/**
		 * Navigates to the Fiorilaunchpad
		 */
		AppVariantUtils.navigateToFLPHomepage = function() {
			var oApplication = sap.ushell.services.AppConfiguration.getCurrentApplication();
			var oComponentInstance = oApplication.componentHandle.getInstance();

			if (oComponentInstance) {
				var oCrossAppNav = sap.ushell.Container.getService("CrossApplicationNavigation");
				if (oCrossAppNav.toExternal){
					oCrossAppNav.toExternal({target: {shellHash: "#"}}, oComponentInstance);
				}
			}

			return Promise.resolve();
		};

		AppVariantUtils.onTransportInDialogSelected = function(oAppVariantDescriptor, oTransportInfo){
			if (oTransportInfo){
				if (oTransportInfo.transport && oTransportInfo.packageName !== "$TMP") {
					if (oTransportInfo.transport) {
						return oAppVariantDescriptor.setTransportRequest(oTransportInfo.transport).then(function() {
							return oAppVariantDescriptor;
						});
					}
				}
				return Promise.resolve(oAppVariantDescriptor);
			}
			return Promise.resolve(false);
		};

		AppVariantUtils.openTransportSelection = function(oTransportInput) {
			var oTransportSelection = new TransportSelection();
			return oTransportSelection.openTransportSelection(oTransportInput, this, RtaUtils.getRtaStyleClassName());
		};

		AppVariantUtils.triggerDeleteAppVariantFromLREP = function(sAppVariantId) {
			return DescriptorVariantFactory.createDeletion(sAppVariantId).then(function(oAppVariantDescriptor) {
				var sNamespace = oAppVariantDescriptor.getNamespace();
				var oTransportInput = this.getTransportInput("", sNamespace, "manifest", "appdescr_variant");

				var mTransportObject = {};
				if (oTransportInput) {
					mTransportObject.package = oTransportInput.getPackage();
					mTransportObject.namespace = oTransportInput.getNamespace();
					mTransportObject.name = oTransportInput.getId();
					mTransportObject.type = oTransportInput.getDefinition().fileType;
				}

				var oTransports = new Transports();

				return oTransports.getTransports(mTransportObject).then(function(oGetTransportsResult) {
					if (!oGetTransportsResult.localonly && oGetTransportsResult.transports.length === 0 && !this.isS4HanaCloud(oAppVariantDescriptor.getSettings())) {
						return RtaUtils._showMessageBox(
							MessageBox.Icon.INFORMATION,
							"DELETE_APP_VARIANT_NO_TRANSPORT",
							"MSG_DELETE_APP_VARIANT_NOT_POSSIBLE");
					} else {
						return this.openTransportSelection(oTransportInput)
						.then(function(oTransportInfo) {
							return this.onTransportInDialogSelected(oAppVariantDescriptor, oTransportInfo);
						}.bind(this))
						.then(function() {
							return oAppVariantDescriptor.submit();
						})
						.then(function() {
							var sMessage = this.getText("DELETE_APP_VARIANT_SUCCESS_MESSAGE");
							MessageToast.show(sMessage);
							return true;
						}.bind(this));
					}
				}.bind(this)).catch(function(oError) {
					this.publishEventBus();
					var oErrorInfo = this.buildErrorInfo("MSG_DELETE_APP_VARIANT_FAILED", oError, sAppVariantId);
					return this.showRelevantDialog(oErrorInfo, false);
				}.bind(this));

			}.bind(this));
		};

		return AppVariantUtils;
}, /* bExport= */true);