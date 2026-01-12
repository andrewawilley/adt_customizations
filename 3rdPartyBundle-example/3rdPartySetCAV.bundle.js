define('3rdparty.bundle', [], function () {

    console.log("#### 3rdparty.bundle.js loaded");

    let globalAuthStatus = null; // Global variable to store auth status
    let authStatusInterval; // Store the interval ID for the polling loop
    let cachedOrgId = null; // Cache orgId once discovered

    function loadSdkInIframe(url, callback) {
        var iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        document.body.appendChild(iframe);

        iframe.onload = function () {
            console.log('#### Iframe loaded, injecting script:', url);
            loadScriptInIframe(iframe, url)
                .then((Five9Sdk) => {
                    console.log('#### Five9 CRM SDK loaded successfully in iframe');
                    if (callback) callback(Five9Sdk);
                })
                .catch((error) => {
                    console.error('#### Error loading Five9 SDK:', error);
                });
        };

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

        iframe.src = 'about:blank';
    }

    loadSdkInIframe('https://cdn.prod.us.five9.net/stable/crm-sdk-lib/five9.crm.sdk.js', async function (Five9Sdk) {
        if (Five9Sdk && Five9Sdk.CrmSdk) {

            const interactionApi = Five9Sdk.CrmSdk.interactionApi();
            const hookApi = Five9Sdk.CrmSdk.hookApi();
            let targetCavId = '';
            let currentInteractionId = '';
            let agentId = '';

            if (interactionApi) {
                // Helper: split "Group.Name" where Name may contain dots
                const parseTargetCav = (fullName) => {
                    const firstDot = fullName.indexOf('.')
                    if (firstDot === -1) {
                        return { group: '', name: fullName }
                    }
                    return {
                        group: fullName.substring(0, firstDot),
                        name: fullName.substring(firstDot + 1)
                    }
                }

                // Helper: fetch org metadata (orgId) via REST and cache it
                const getOrgId = async () => {
                    if (cachedOrgId) return cachedOrgId;
                    try {
                        const res = await interactionApi.executeRestApi({
                            path: '/appsvcs/rs/svc/auth/metadata',
                            method: 'GET',
                            payload: null,
                        });
                        let meta = null;
                        try {
                            meta = JSON.parse(res.response || 'null');
                        } catch (e) {
                            console.error('### Failed to parse auth/metadata response', e, res);
                        }
                        const orgId = meta?.orgId || meta?.org?.id || meta?.organizationId;
                        if (!orgId) {
                            console.warn('### auth/metadata did not include orgId; response:', meta);
                            return null;
                        }
                        cachedOrgId = orgId;
                        console.log('### Cached orgId:', cachedOrgId);
                        return cachedOrgId;
                    } catch (e) {
                        console.error('### Error calling auth/metadata:', e);
                        return null;
                    }
                };

                // Helper: fetch all domain CAVs using REST via CRM SDK
                const getDomainCAVs = async (orgId) => {
                    if (!orgId) return null;
                    try {
                        const res = await interactionApi.executeRestApi({
                            path: `/appsvcs/rs/svc/orgs/${orgId}/call_variables`,
                            method: 'GET',
                            payload: null,
                        });
                        let cavs = [];
                        try {
                            cavs = JSON.parse(res.response || '[]');
                        } catch (e) {
                            console.error('### Failed to parse call_variables response', e, res);
                            return null;
                        }
                        if (!Array.isArray(cavs)) {
                            console.warn('### call_variables response is not an array:', cavs);
                            return null;
                        }
                        console.debug(`### Retrieved ${cavs.length} domain CAV(s)`);
                        console.debug(`### Domain CAVs:`, cavs);
                        return cavs;
                    } catch (e) {
                        console.error('### Error fetching domain call variables:', e);
                        return null;
                    }
                };

                interactionApi.subscribe({
                    callStarted: (params) => {
                        const targetCav = 'Custom.crm_LeadID_txt'; // Change to desired CAV (format: "Group.Name"; Name may contain dots)
                        const { group: targetCavGroup, name: targetCavName } = parseTargetCav(targetCav);

                        currentInteractionId = params?.callData?.interactionId;
                        agentId = params?.callData?.agentId || agentId;
                        console.log(`### Current Call ID Updated: ${currentInteractionId}`);

                        if (!currentInteractionId) {
                            console.warn('### No interactionId on callStarted; skipping CAV set');
                            return;
                        }

                        // Fetch orgId -> domain CAVs -> find target -> set value
                        (async () => {
                            try {
                                const orgId = await getOrgId();
                                if (!orgId) {
                                    console.warn('### Cannot resolve orgId; aborting CAV lookup');
                                    return;
                                }

                                const domainCavs = await getDomainCAVs(orgId);
                                if (!domainCavs || domainCavs.length === 0) {
                                    console.warn('### No domain CAVs returned; cannot find target CAV');
                                    return;
                                }
                                
                                console.log(`### Looking for target domain CAV: group="${targetCavGroup}", name="${targetCavName}"`);
                                console.log(`### domaincavs=`, domainCavs);
                                const match = domainCavs.find((cav) => cav && cav.group === targetCavGroup && cav.name === targetCavName);
                                if (!match) {
                                    console.warn(`### Target domain CAV not found: group="${targetCavGroup}", name="${targetCavName}"`);
                                    const groups = [...new Set(domainCavs.map((c) => c?.group).filter(Boolean))];
                                    console.debug('### Available domain CAV groups:', groups);
                                    return;
                                }

                                console.log(`### Found target domain CAV: group="${targetCavGroup}", name="${targetCavName}", id=${match.id}`);

                                await interactionApi.setCav({
                                    interactionId: currentInteractionId,
                                    cavList: [{ id: match.id, value: String(currentInteractionId) }],
                                });
                                console.log('### Successfully set CAV value for ID:', match.id);

                                // Verify by fetching call CAVs for the interaction
                                try {
                                    const verifyResp = await interactionApi.getCav({ interactionId: currentInteractionId });
                                    const cavs2 = Array.isArray(verifyResp)
                                        ? verifyResp
                                        : (Array.isArray(verifyResp?.cavs) ? verifyResp.cavs : []);
                                    const verified = cavs2.find((c) => c && c.id === match.id);
                                    if (verified?.value == String(currentInteractionId)) {
                                        console.log('### Verified CAV value persisted:', verified);
                                    } else {
                                        console.warn('### CAV value did not verify; got:', verified);
                                    }
                                } catch (vErr) {
                                    console.warn('### Verification getCav failed:', vErr);
                                }
                            } catch (err) {
                                console.error('### Error executing domain CAV lookup/set flow:', err);
                            }
                        })();
                    },
                });

                // console.log(`### UPDATED Attempting to register hooks`)

                // hookApi.registerApi({

                //     // beforeTransfer: function (params) {
                //     //     console.log(`### beforeTransfer PARAMS:`, params)
                //     //     return Promise.resolve({
                //     //         status: {
                //     //             statusCode: Five9.CrmSdk.HookStatusCode.Confirmation
                //     //         }
                //     //     });
                //     // },

                //     // beforeDisposition: function (params) {
                //     //     console.log(`### beforeDisposition PARAMS:`, params)

                //     //     const targetStatusCode = Five9Sdk.CrmSdk.HookStatusCode.Confirmation;
                //     //     console.log("### The value of the target statuscode is: ", targetStatusCode)
                //     //     return Promise.resolve({
                //     //         status: {
                //     //             statusCode: targetStatusCode,
                //     //             message: `Do you want to proceed?`,
                //     //             messageHeader: "Confirmation",
                //     //         },
                //     //     });
                //     // }
                // });

            } else {
                console.error("#### Interaction API not available");
            }
        } else {
            console.error("#### SDK load failed or CrmSdk is undefined");
        }
    });
});