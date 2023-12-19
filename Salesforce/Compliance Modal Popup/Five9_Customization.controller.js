({
  f9libLoaded: function (cmp, evt, helper) {
    // This customization should pop up a compliance language dialog when the agent logs in

    const hookApi = window.Five9.CrmSdk.hookApi();
    const interactionApi = window.Five9.CrmSdk.interactionApi();

    // Custom logging class to add a prefix and timestamp to the console log for easy identification
    // initialize logging variables  
    const defaultLoggingPrefix = "[*****]";
    const allowedLoggingModes = ["error", "warn", "log", "info", "debug"];
    class consoleLogger {
      constructor(prefix = defaultLoggingPrefix) {
        this.prefix = prefix;

        // for each mode in allowedLoggingModes, create a function
        // that will log the message with the mode
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
                hour12: false, // use 24-hour time format
              })}) ${messages
                .map((message) => {
                  if (typeof message === "object") {
                    return `\n${JSON.stringify(message)}`;
                  } else {
                    return message;
                  }
                })
                .join(" ")}`
            );
          };
        });
      }
    }
    const console2 = new consoleLogger();
    console2.info("Customization loaded.")

    // subscribe to WsEvents
    interactionApi.subscribeWsEvent({
      // Event 22009 is the event that is fired when the agent first logs in and the Five9 Metadata is obtained
      "22009": function (payLoad, context) {
        console2.log("websocket connected")
        try {
          // console2.debug("About to show the modal");
          var modalBody;
          $A.createComponent("c:ComplianceAcknowledgmentModal", {},
            function (content, status, errorMessage) {
              if (status === "SUCCESS") {
                modalBody = content;
                cmp.find('overlayLib').showCustomModal({
                  header: "Compliance Acknowledgment",
                  body: modalBody,
                  showCloseButton: true,
                  closeCallback: function () {
                    // Handle the close logic here if needed
                  }
                });
              } else if (status === "INCOMPLETE") {
                console2.error("No response from server or client is offline.");
              } else if (status === "ERROR") {
                console2.error("Error: " + errorMessage);
              }
            }
          );
        } catch (e) {
          console2.error("error in callback", e)
        }
      }
    });
  },

  doInit: function (cmp, evt, helper) {
    // optional

  },
});
