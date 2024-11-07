define('3rdparty.bundle', [], function () {

    console.log("#### 3rdparty.bundle.js loaded");

    function loadSdkInIframe(url, callback) {
        // Create an iframe element
        var iframe = document.createElement('iframe');
        iframe.style.display = 'none'; // Hide the iframe
        document.body.appendChild(iframe);
    
        // Wait for the iframe to load before adding the script
        iframe.onload = function () {
            console.log('#### Iframe loaded, injecting script:', url);
            loadScriptInIframe(iframe, url)
                .then((Five9Sdk) => {
                    console.log('#### Five9 CRM SDK loaded successfully in iframe');
                    if (callback) callback(Five9Sdk);
                })
                .catch((error) => {
                    console.error(error);
                });
        };

        // Function to load the script inside the iframe
        function loadScriptInIframe(iframe, url) {
            return new Promise((resolve, reject) => {
                console.log('#### Loading SDK Script inside iframe:', url);
                var script = iframe.contentDocument.createElement('script');
                script.type = 'text/javascript';
                script.src = url;
                script.async = true;
    
                script.onload = () => {
                    console.log('#### SDK Script loaded inside iframe:', url);
                    resolve(iframe.contentWindow.Five9);
                };

                script.onerror = () => {
                    console.error('#### Failed to load SDK script inside iframe:', url);
                    reject(new Error('Failed to load script inside iframe: ' + url));
                };

                iframe.contentDocument.head.appendChild(script);
            });
        }
    
        console.log('#### Setting up Five9 CRM SDK loading in iframe:', url);
        // Set the iframe's src to a blank page to ensure it is loaded
        iframe.src = 'about:blank';
    }

    // Usage example
    loadSdkInIframe('https://app.five9.com/dev/sdk/crm/latest/five9.crm.sdk.js', function (Five9Sdk) {
        console.log('#### SDK loaded from iframe:', Five9Sdk);
        // Use the Five9 SDK from the iframe
        const interactionApi = Five9Sdk.CrmSdk.interactionApi();
        console.log('#### Interaction API:', interactionApi);

        Five9.CrmSdk.customComponentsApi().registerCustomComponents({
            template: `<adt-components>
            <adt-component location="3rdPartyComp-li-chat-details-top" label="Auth Status: " style="flex-direction: column"></adt-component>                      
                    </adt-components>`
            ,
            callbacks: {
                callTabInputCallback: function (params) {
                    debugStream.debug({
                        callee: arguments.callee.name,
                        data: params
                    });
                }
            }
        });

        // register callbacks to the interaction API
        interactionApi.subscribe({
            chatAccepted: (interactionSubscriptionEvent) => {
                const currentInteractionId = interactionSubscriptionEvent.chatData.interactionId;
                f9UserId = interactionSubscriptionEvent.chatData.agentId;
                f9UserName = interactionSubscriptionEvent.chatData.agentName;

                console.log("#### Chat Accepted:", interactionSubscriptionEvent);
                console.log(`#### Current Interaction Id: ${currentInteractionId}`);
                // loop through the customFields array and create a new object with the key value pairs
                let customFieldData = {};
                interactionSubscriptionEvent.chatData.customFields.forEach((field) => {
                    customFieldData[field.key] = field.value;
                });
                let authStatus = customFieldData['ChatVariables.authenticated'];
                console.log(`#### Auth Status: ${customFieldData['ChatVariables.authenticated']}`)

                // Select the first iframe on the page
                var iframe = document.querySelector('iframe');
                console.log("#### Iframe:", iframe);
                if (iframe) {
                    console.log("#### Iframe Found")
                    // Access the content of the iframe
                    var iframeDocument = iframe.contentDocument || iframe.contentWindow.document;

                    // Find the target div inside the iframe
                    var targetDiv = iframeDocument.getElementById('3rdPartyComp-li-chat-details-top');

                    if (targetDiv) {
                        // Find the label inside the target div
                        var label = targetDiv.querySelector('label');

                        if (label) {
                            // Change the content of the label
                            label.innerHTML = 'New Content Here';
                        }
                    }
                }
            }
        });

    })
});
