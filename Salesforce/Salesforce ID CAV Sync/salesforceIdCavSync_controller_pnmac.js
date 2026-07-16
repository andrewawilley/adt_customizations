({
  f9libLoaded: function (cmp, evt, helper) {
    // Hybrid solution: sets the Salesforce.salesforce_id CAV to the Salesforce ID of the
    // "in-focus" record whenever a record is selected, screen-popped, or a call starts.
    //
    // Hybrid approach:
    //   - REST-based CAV ID resolution (from 3rdPartySetCAV.bundle.js) so the CAV definition
    //     is resolved via the Five9 domain API rather than relying on getCav() at call start.
    //     This is more reliable across call states and doesn't require a live call to cache defs.
    //   - Idempotency via lastSetRecordId tracker to prevent redundant setCav calls from
    //     high-frequency WS event 4 (Interaction Updated) callbacks.
    //   - Lightning component event handling (objectSelected, afterScreenPop, beforeDisposition)
    //     from the Related To Record Confirmation sample, including the beforeDisposition
    //     confirmation prompt when the selected record doesn't match the in-focus record.

    const hookApi = window.Five9.CrmSdk.hookApi();
    const interactionApi = window.Five9.CrmSdk.interactionApi();

    // =========================================================================
    // Logging
    // =========================================================================
    const defaultLoggingPrefix = "[SF-ID-CAV-SYNC]";
    const allowedLoggingModes = ["error", "warn", "log", "info", "debug"];
    class ConsoleLogger {
      constructor(prefix = defaultLoggingPrefix) {
        this.prefix = prefix;
        allowedLoggingModes.forEach((mode) => {
          this[mode] = (...messages) => {
            const d = new Date();
            console[mode](
              `${this.prefix} (${d.toLocaleString(undefined, {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
              })}) ${messages
                .map((m) => (typeof m === "object" ? "\n" + JSON.stringify(m) : m))
                .join(" ")}`
            );
          };
        });
      }
    }
    const console2 = new ConsoleLogger();

    console2.info("Salesforce ID CAV Sync customization loaded.");

    // =========================================================================
    // Config — change TARGET_CAV_* if the CAV group/name differs in your org
    // =========================================================================
    const TARGET_CAV_GROUP = "SalesForce";
    const TARGET_CAV_NAME  = "SalesForce_Id";
    const TARGET_CAV_FULL  = `${TARGET_CAV_GROUP}.${TARGET_CAV_NAME}`;

    // =========================================================================
    // State
    // =========================================================================
    let cachedOrgId        = null;   // orgId fetched from auth/metadata, cached after first call
    let cachedTargetCavDef = null;   // domain CAV definition object for Salesforce.salesforce_id

    let currentInteractionId = "";   // Five9 interaction ID of the active call
    let selectedRecordId     = "";   // Salesforce ID of the record last linked to the call
    let lastSetRecordId      = null; // last value we successfully wrote to the CAV
                                     // (prevents redundant setCav on WS event 4 callbacks)

    // =========================================================================
    // REST-based CAV definition resolution (hybrid from 3rdPartySetCAV.bundle.js)
    // Resolves the numeric CAV id for Salesforce.salesforce_id via the Five9
    // domain API so the controller doesn't need an active call to look up the id.
    // =========================================================================

    const getOrgId = async () => {
      if (cachedOrgId) return cachedOrgId;
      try {
        const res = await interactionApi.executeRestApi({
          path: "/appsvcs/rs/svc/auth/metadata",
          method: "GET",
          payload: null,
        });
        let meta = null;
        try {
          meta = JSON.parse(res.response || "null");
        } catch (e) {
          console2.error("Failed to parse auth/metadata response:", e, res);
        }
        const orgId = meta?.orgId || meta?.org?.id || meta?.organizationId;
        if (!orgId) {
          console2.warn("auth/metadata did not include orgId; response:", meta);
          return null;
        }
        cachedOrgId = orgId;
        console2.log("Cached orgId:", cachedOrgId);
        return cachedOrgId;
      } catch (e) {
        console2.error("Error calling auth/metadata:", e);
        return null;
      }
    };

    const resolveTargetCavDef = async () => {
      if (cachedTargetCavDef) return cachedTargetCavDef;

      const orgId = await getOrgId();
      if (!orgId) {
        console2.warn("Cannot resolve orgId; aborting CAV definition lookup.");
        return null;
      }

      try {
        const res = await interactionApi.executeRestApi({
          path: `/appsvcs/rs/svc/orgs/${orgId}/call_variables`,
          method: "GET",
          payload: null,
        });
        let domainCavs = [];
        try {
          domainCavs = JSON.parse(res.response || "[]");
        } catch (e) {
          console2.error("Failed to parse call_variables response:", e, res);
          return null;
        }

        if (!Array.isArray(domainCavs)) {
          console2.warn("call_variables response is not an array:", domainCavs);
          return null;
        }

        console2.debug(`Retrieved ${domainCavs.length} domain CAV(s).`);

        const def = domainCavs.find(
          (c) => c?.group === TARGET_CAV_GROUP && c?.name === TARGET_CAV_NAME
        );

        if (!def) {
          console2.warn(`CAV "${TARGET_CAV_FULL}" not found in domain CAVs.`);
          const availableGroups = [...new Set(domainCavs.filter(Boolean).map((c) => c?.group))];
          console2.debug("Available CAV groups:", availableGroups);
          return null;
        }

        cachedTargetCavDef = def;
        console2.log(`Resolved ${TARGET_CAV_FULL} definition — id: ${def.id}`);
        return cachedTargetCavDef;
      } catch (e) {
        console2.error("Error fetching domain call variables:", e);
        return null;
      }
    };

    // =========================================================================
    // CAV update
    // Skips the network call if salesforceId matches the last successfully-set
    // value, preventing a feedback loop with WS event 4 callbacks.
    // =========================================================================
    async function updateSalesforceIdCAV(salesforceId) {
      if (!currentInteractionId) {
        console2.warn("No active interactionId; skipping CAV update.");
        return;
      }

      // Idempotency guard — avoids redundant setCav calls from WS event 4
      if (salesforceId === lastSetRecordId) {
        console2.debug(`${TARGET_CAV_FULL} already set to "${salesforceId}"; skipping.`);
        return;
      }

      const cavDef = await resolveTargetCavDef();
      if (!cavDef) {
        console2.warn("Could not resolve target CAV definition; skipping update.");
        return;
      }

      try {
        await interactionApi.setCav({
          interactionId: currentInteractionId,
          cavList: [{ id: cavDef.id, value: salesforceId || "" }],
        });
        lastSetRecordId = salesforceId;
        console2.log(
          `Set ${TARGET_CAV_FULL} = "${salesforceId}" on interaction ${currentInteractionId}`
        );
      } catch (e) {
        console2.error("Error setting CAV:", e);
      }
    }

    // =========================================================================
    // Interaction API subscriptions
    // =========================================================================
    interactionApi.subscribe({

      // Pre-warm the CAV definition cache as soon as a call arrives.
      // If the agent is already viewing a record, sync it immediately.
      callStarted: (startedCall) => {
        console2.log("callStarted:", startedCall);
        currentInteractionId = startedCall.callData.interactionId;
        lastSetRecordId = null; // reset idempotency guard for new call

        // Pre-warm: resolve the CAV def in the background so the first
        // objectSelected or afterScreenPop update is faster.
        resolveTargetCavDef();

        const inFocusRecordId = cmp.get("v.recordId");
        if (inFocusRecordId) {
          console2.log("Agent is viewing a record at call start; syncing CAV:", inFocusRecordId);
          selectedRecordId = inFocusRecordId;
          updateSalesforceIdCAV(selectedRecordId);
        }
      },

      // callAccepted fires after callStarted; ensure the CAV is set if it
      // wasn't already (e.g. if callStarted fired before the page loaded).
      callAccepted: (acceptedCall) => {
        console2.log("callAccepted:", acceptedCall);
        if (selectedRecordId) {
          updateSalesforceIdCAV(selectedRecordId);
        }
      },

      // Agent manually selects a related-to record in the Five9 adapter toolbar.
      objectSelected: (selectedObject) => {
        console2.log("objectSelected:", selectedObject);

        let recordId = selectedObject?.crmObject?.id;

        if (recordId) {
          // The id field may be a short key; the full Salesforce ID lives in the URL.
          // Walk URL segments to find the one that contains the id value.
          const url = selectedObject?.crmObject?.metadata?.url || "";
          const urlParts = url.split("/");
          for (const part of urlParts) {
            if (part.includes(recordId)) {
              recordId = part;
              break;
            }
          }
        }

        selectedRecordId = recordId || "";
        console2.log("selectedRecordId updated to:", selectedRecordId);

        if (currentInteractionId) {
          updateSalesforceIdCAV(selectedRecordId);
        }
      },

      // Clean up state when the call ends.
      callEnded: (endedCall) => {
        console2.log("callEnded:", endedCall);
        currentInteractionId = "";
        selectedRecordId     = "";
        lastSetRecordId      = null;
      },
    });

    // =========================================================================
    // Hook API
    // =========================================================================
    hookApi.registerApi({

      // Screen pop: set selectedRecordId and sync the CAV immediately.
      afterScreenPop: function (screenPopData) {
        console2.log("afterScreenPop:", screenPopData);
        if (screenPopData.screenPopObjects.length === 1) {
          selectedRecordId = screenPopData.screenPopObjects[0].params.recordId;
          console2.log("Screen pop set selectedRecordId:", selectedRecordId);
          updateSalesforceIdCAV(selectedRecordId);
        }
        return Promise.resolve({
          status: { statusCode: Five9.CrmSdk.HookStatusCode.Proceed },
        });
      },

      // Before the agent dispositions, verify that the record linked to the call
      // matches the record currently in focus.  If not, ask for confirmation.
      beforeDisposition: function (dispositionData) {
        console2.log("beforeDisposition:", dispositionData);

        const inFocusRecordId = cmp.get("v.recordId");
        console2.log(
          `In-focus record: ${inFocusRecordId} | Selected (CAV) record: ${selectedRecordId}`
        );

        if (
          selectedRecordId &&
          inFocusRecordId &&
          selectedRecordId !== inFocusRecordId
        ) {
          console2.warn(
            `Record mismatch — CAV points to ${selectedRecordId} but agent is viewing ${inFocusRecordId}`
          );
          return Promise.resolve({
            status: {
              statusCode: Five9.CrmSdk.HookStatusCode.Confirmation,
              messageHeader: "Record Mismatch",
              message: `The record linked to this call (${selectedRecordId}) doesn't match the record currently in focus (${inFocusRecordId}). Do you want to proceed?`,
            },
          });
        }

        console2.log("No record mismatch; proceeding with disposition.");
        return Promise.resolve({
          status: { statusCode: Five9.CrmSdk.HookStatusCode.Proceed },
        });
      },
    });

    // =========================================================================
    // WS Events — backup / drift correction
    // Event 4 (Interaction Updated) can fire frequently; the idempotency guard in
    // updateSalesforceIdCAV prevents a setCav → event 4 → setCav feedback loop.
    // =========================================================================
    interactionApi.subscribeWsEvent({

      // Event 4: Interaction Updated — re-assert the CAV if the interaction
      // data changed and our value may have been overwritten.
      "4": function (payLoad, context) {
        console2.debug("WS Event 4 (Interaction Updated):", context?.eventReason);
        const interactionId = payLoad?.id || currentInteractionId;
        if (!interactionId || !selectedRecordId) return;
        if (currentInteractionId && interactionId !== currentInteractionId) return;

        updateSalesforceIdCAV(selectedRecordId);
      },

      // Event 5: Interaction Ended — clear local state.
      "5": function (payLoad, context) {
        console2.debug("WS Event 5 (Interaction Ended)");
        currentInteractionId = "";
        selectedRecordId     = "";
        lastSetRecordId      = null;
      },
    });
  },

  doInit: function (cmp, evt, helper) {
    var recordLoader = cmp.find("recordLoader");
    recordLoader.reloadRecord();
  },
});
