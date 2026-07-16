define('3rdparty.bundle', [], function () {

    console.log("#### 3rdparty.bundle.js loaded (new)");

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
            const sessionIdCav = 'Call.session_id';
            const targetCav = 'Custom.crm_LeadID_txt';
            const cavSetStateByInteractionId = {};
            let cachedDomainCavDefinitions = null;
            let cachedSessionIdCavDef = null;
            let cachedTargetCavDef = null;

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

                const { group: targetCavGroup, name: targetCavName } = parseTargetCav(targetCav);
                const { group: sessionIdCavGroup, name: sessionIdCavName } = parseTargetCav(sessionIdCav);

                const getInteractionSetState = (interactionId) => {
                    if (!interactionId) return null;
                    if (!cavSetStateByInteractionId[interactionId]) {
                        cavSetStateByInteractionId[interactionId] = {
                            completed: false,
                            inFlight: false,
                            lastAttemptAt: 0,
                        };
                    }
                    return cavSetStateByInteractionId[interactionId];
                };

                const resolveTargetCavDefinitions = async () => {
                    if (cachedDomainCavDefinitions && cachedSessionIdCavDef && cachedTargetCavDef) {
                        return {
                            domainCavs: cachedDomainCavDefinitions,
                            sessionIdDef: cachedSessionIdCavDef,
                            targetCavDef: cachedTargetCavDef,
                        };
                    }

                    const orgId = await getOrgId();
                    if (!orgId) {
                        console.warn('### Cannot resolve orgId; aborting CAV lookup');
                        return null;
                    }

                    const domainCavs = await getDomainCAVs(orgId);
                    if (!domainCavs || domainCavs.length === 0) {
                        console.warn('### No domain CAVs returned; cannot find target CAV');
                        return null;
                    }

                    console.log('### Looking for CAV definitions in domain CAVs...');

                    const sessionIdDef = domainCavs.find((cav) => cav && cav.group === sessionIdCavGroup && cav.name === sessionIdCavName);
                    if (!sessionIdDef) {
                        console.warn(`### Session ID CAV not found in domain CAVs: ${sessionIdCav}`);
                        return null;
                    }
                    console.log(`### Found session_id definition: id=${sessionIdDef.id}`);

                    const targetCavDef = domainCavs.find((cav) => cav && cav.group === targetCavGroup && cav.name === targetCavName);
                    if (!targetCavDef) {
                        console.warn(`### Target CAV not found in domain CAVs: ${targetCav}`);
                        const groups = [...new Set(domainCavs.filter(Boolean).map((c) => c?.group).filter(Boolean))];
                        console.debug('### Available domain CAV groups:', groups);
                        return null;
                    }
                    console.log(`### Found target CAV definition: id=${targetCavDef.id}`);

                    cachedDomainCavDefinitions = domainCavs;
                    cachedSessionIdCavDef = sessionIdDef;
                    cachedTargetCavDef = targetCavDef;
                    targetCavId = String(targetCavDef.id);

                    return {
                        domainCavs,
                        sessionIdDef,
                        targetCavDef,
                    };
                };

                const getCallCavs = async (interactionId) => {
                    const cavsResp = await interactionApi.getCav({ interactionId });
                    console.log('### getCav response:', JSON.stringify(cavsResp).substring(0, 500));
                    return Array.isArray(cavsResp)
                        ? cavsResp
                        : (Array.isArray(cavsResp?.cavs) ? cavsResp.cavs : []);
                };

                const ensureTargetCavSet = async (interactionId, options = {}) => {
                    const state = getInteractionSetState(interactionId);
                    if (!interactionId || !state) {
                        console.warn('### No interactionId available; skipping CAV set attempt');
                        return;
                    }

                    if (state.completed) {
                        return;
                    }

                    if (state.inFlight) {
                        console.debug(`### CAV set already in flight for interaction ${interactionId}`);
                        return;
                    }

                    const now = Date.now();
                    if (now - state.lastAttemptAt < 1000) {
                        console.debug(`### Skipping duplicate CAV set attempt for interaction ${interactionId}`);
                        return;
                    }

                    state.inFlight = true;
                    state.lastAttemptAt = now;

                    try {
                        const defs = await resolveTargetCavDefinitions();
                        if (!defs) {
                            return;
                        }

                        const { sessionIdDef, targetCavDef } = defs;
                        let callCavs = Array.isArray(options.callCavs) ? options.callCavs : null;
                        let variablesById = options.variablesById && typeof options.variablesById === 'object'
                            ? options.variablesById
                            : null;

                        if (!callCavs && !variablesById) {
                            callCavs = await getCallCavs(interactionId);
                        }

                        const sessionIdKey = String(sessionIdDef.id);
                        const targetCavKey = String(targetCavDef.id);
                        const sessionCav = callCavs
                            ? callCavs.find((c) => c && String(c.id) === sessionIdKey)
                            : null;
                        const targetCavValue = variablesById
                            ? variablesById[targetCavKey]
                            : callCavs?.find((c) => c && String(c.id) === targetCavKey)?.value;
                        const sessionIdValue = variablesById
                            ? variablesById[sessionIdKey]
                            : sessionCav?.value;

                        if (callCavs) {
                            console.log('### Found session_id CAV in call:', sessionCav);
                        }
                        console.log(`### Session ID value: "${sessionIdValue || ''}"`);

                        if (!sessionIdValue) {
                            console.warn('### Call.session_id value is empty or not found');
                            if (callCavs) {
                                console.debug('### Available call CAVs:', callCavs.filter(Boolean).map(c => `${c.group}.${c.name}=${c.value}`).slice(0, 20));
                            } else if (variablesById) {
                                console.debug('### Available websocket variable ids:', Object.keys(variablesById).slice(0, 20));
                            }
                            return;
                        }

                        if (String(targetCavValue || '') === String(sessionIdValue)) {
                            state.completed = true;
                            console.log(`### ${targetCav} already set to desired value for interaction ${interactionId}`);
                            return;
                        }

                        console.log(`### Setting ${targetCav} (id=${targetCavDef.id}) = "${sessionIdValue}" via ${options.source || 'unknown source'}`);

                        await interactionApi.setCav({
                            interactionId,
                            cavList: [{ id: targetCavDef.id, value: String(sessionIdValue) }],
                        });

                        state.completed = true;
                        console.log('### Successfully set CAV value');
                    } catch (err) {
                        console.error('### Error executing domain CAV lookup/set flow:', err);
                    } finally {
                        state.inFlight = false;
                    }
                };

                interactionApi.subscribe({
                    callAccepted: (params) => {
                        currentInteractionId = params?.callData?.interactionId;
                        agentId = params?.callData?.agentId || agentId;
                        console.log(`### Current Interaction ID Updated: ${currentInteractionId}`);

                        if (!currentInteractionId) {
                            console.warn('### No interactionId on callAccepted; skipping CAV set');
                            return;
                        }

                        ensureTargetCavSet(currentInteractionId, { source: 'callAccepted' });
                    },
                    callEnded: (params) => {
                        const endedInteractionId = params?.callData?.interactionId;
                        if (endedInteractionId && cavSetStateByInteractionId[endedInteractionId]) {
                            delete cavSetStateByInteractionId[endedInteractionId];
                        }
                    },
                });

                interactionApi.subscribeWsEvent({
                    '4': (payLoad, context) => {
                        try {
                            const interactionId = payLoad?.id || currentInteractionId;
                            const variablesById = payLoad?.variables;
                            if (!interactionId) {
                                console.debug('### WS event 4 missing interaction id; skipping CAV verification');
                                return;
                            }

                            if (currentInteractionId && interactionId !== currentInteractionId) {
                                return;
                            }

                            console.debug('### WS event 4 received for CAV verification:', {
                                interactionId,
                                eventReason: context?.eventReason,
                                state: payLoad?.state,
                                targetCavId,
                            });

                            ensureTargetCavSet(interactionId, {
                                source: `ws event 4 (${context?.eventReason || 'UPDATED'})`,
                                variablesById,
                            });
                        } catch (e) {
                            console.error('### Error handling WS event 4 for CAV verification:', e);
                        }
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