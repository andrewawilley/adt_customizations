define('3rdparty.bundle', [], function () {
  /**
   * CTI Adapter (Salesforce-domain iframe) helper.
   *
   * Goal: replicate the “set Five9 log what/who” behavior from
   * `private/CSCFive9SDKPlugin/CSCFive9SDKPluginController.js` but from a CTI iframe
   * using Salesforce APIs available in that context.
   *
   * Assumptions:
   * - This code runs on a Salesforce domain (same-origin calls to `/services/data/...` work).
   * - Open CTI is available as `sforce.opencti` (typical for CTI adapters).
   */

  console.log('#### 3rdParty.salesforceContext.bundle.js loaded');

  const logPrefix = '[CTI-SF]';
  const log = {
    info: (...args) => console.log(logPrefix, ...args),
    warn: (...args) => console.warn(logPrefix, ...args),
    error: (...args) => console.error(logPrefix, ...args),
    debug: (...args) => console.debug(logPrefix, ...args),
  };

  const state = {
    sfApiVersion: null,
    context: {
      recordId: null,
      caseId: null,
      contactId: null,
      accountId: null,
    },
  };

  const isOpenCtiAvailable = () =>
    typeof window !== 'undefined' &&
    window.sforce &&
    window.sforce.opencti &&
    typeof window.sforce.opencti.getPageInfo === 'function';

  async function resolveSfApiVersion() {
    if (state.sfApiVersion) return state.sfApiVersion;

    // Best-effort: discover supported versions.
    // On Salesforce domain, GET /services/data returns an array like: [{version:"60.0", url:"/services/data/v60.0"}, ...]
    try {
      const res = await fetch('/services/data/', {
        method: 'GET',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const versions = await res.json();
      if (Array.isArray(versions) && versions.length) {
        const best = versions
          .map((v) => (v && v.version ? String(v.version) : null))
          .filter(Boolean)
          .sort((a, b) => {
            const na = Number(a);
            const nb = Number(b);
            if (!Number.isNaN(na) && !Number.isNaN(nb)) return nb - na;
            return b.localeCompare(a);
          })[0];

        state.sfApiVersion = best || '60.0';
        log.info('Resolved Salesforce REST version:', state.sfApiVersion);
        return state.sfApiVersion;
      }
    } catch (e) {
      log.warn('Failed to auto-resolve Salesforce REST API version; using fallback.', e);
    }

    state.sfApiVersion = '60.0';
    return state.sfApiVersion;
  }

  async function sfRest(path, { method = 'GET', body = null, headers = {} } = {}) {
    const v = await resolveSfApiVersion();
    const url = path.startsWith('/') ? `/services/data/v${v}${path}` : `/services/data/v${v}/${path}`;

    const res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body == null ? null : typeof body === 'string' ? body : JSON.stringify(body),
    });

    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch (_) {
      // not JSON
    }

    if (!res.ok) {
      const msg = json && json[0] && json[0].message ? json[0].message : text;
      throw new Error(`Salesforce REST ${method} ${url} failed: HTTP ${res.status} ${msg}`);
    }

    return json;
  }

  async function sfQuery(soql) {
    const q = encodeURIComponent(soql);
    return sfRest(`/query/?q=${q}`, { method: 'GET' });
  }

  function shortenId(id) {
    if (!id) return null;
    const s = String(id);
    return s.length > 15 ? s.substring(0, 15) : s;
  }

  async function getInFocusRecordId() {
    if (!isOpenCtiAvailable()) return null;

    return new Promise((resolve) => {
      try {
        window.sforce.opencti.getPageInfo({
          callback: function (result) {
            const recordId = result && result.success && result.returnValue && result.returnValue.recordId;
            resolve(recordId || null);
          },
        });
      } catch (e) {
        log.warn('Open CTI getPageInfo threw; treating as no record.', e);
        resolve(null);
      }
    });
  }

  async function deriveContextFromRecord(recordId) {
    const ctx = {
      recordId: recordId || null,
      caseId: null,
      contactId: null,
      accountId: null,
    };

    if (!recordId) return ctx;

    const id15 = shortenId(recordId);
    const prefix = id15.substring(0, 3);

    try {
      if (prefix === '500') {
        // Case
        ctx.caseId = id15;
        const r = await sfQuery(`SELECT Id, ContactId, AccountId FROM Case WHERE Id = '${id15}' LIMIT 1`);
        const rec = r && r.records && r.records[0];
        ctx.contactId = rec && rec.ContactId ? shortenId(rec.ContactId) : null;
        ctx.accountId = rec && rec.AccountId ? shortenId(rec.AccountId) : null;
      } else if (prefix === '003') {
        // Contact
        ctx.contactId = id15;
        const r = await sfQuery(`SELECT Id, AccountId FROM Contact WHERE Id = '${id15}' LIMIT 1`);
        const rec = r && r.records && r.records[0];
        ctx.accountId = rec && rec.AccountId ? shortenId(rec.AccountId) : null;
      } else if (prefix === '001') {
        // Account
        ctx.accountId = id15;
      } else {
        // Unknown object type (Lead, Opportunity, etc). We keep recordId only.
        log.debug('In-focus record is not Case/Contact/Account; prefix:', prefix);
      }
    } catch (e) {
      log.warn('Failed deriving context from record via REST; proceeding with partial context.', e);
    }

    return ctx;
  }

  function buildFive9CrmObject({ type, id, label, isWhat, isWho }) {
    return {
      isWhat: !!isWhat,
      isWho: !!isWho,
      type,
      id,
      label,
      name: '',
      customName: null,
      fields: [],
      metadata: null,
      visitedTime: null,
    };
  }

  function applyWhatWhoToLog(newFields) {
    const { caseId, contactId, accountId } = state.context;

    // Mimic existing behavior as closely as possible without Lightning Workspace APIs.
    // - Prefer Case as what if present.
    // - Else fall back to Account.
    if (caseId) {
      newFields.what = buildFive9CrmObject({
        type: 'Case',
        id: shortenId(caseId),
        label: 'Case',
        isWhat: true,
        isWho: false,
      });
    } else if (accountId) {
      newFields.what = buildFive9CrmObject({
        type: 'Account',
        id: shortenId(accountId),
        label: 'Account',
        isWhat: true,
        isWho: false,
      });
    }

    if (contactId) {
      newFields.who = buildFive9CrmObject({
        type: 'Contact',
        id: shortenId(contactId),
        label: 'Contact',
        isWhat: false,
        isWho: true,
      });
    }
  }

  function loadSdkInIframe(url, callback) {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    iframe.onload = function () {
      const script = iframe.contentDocument.createElement('script');
      script.type = 'text/javascript';
      script.src = url;
      script.async = true;

      script.onload = () => callback && callback(iframe.contentWindow.Five9);
      script.onerror = () => log.error('Failed to load Five9 CRM SDK:', url);

      iframe.contentDocument.head.appendChild(script);
    };

    iframe.src = 'about:blank';
  }

  loadSdkInIframe('https://cdn.prod.us.five9.net/stable/crm-sdk-lib/five9.crm.sdk.js', function (Five9Sdk) {
    if (!Five9Sdk || !Five9Sdk.CrmSdk) {
      log.error('Five9 SDK load failed or CrmSdk is undefined');
      return;
    }

    const interactionApi = Five9Sdk.CrmSdk.interactionApi();
    const hookApi = Five9Sdk.CrmSdk.hookApi();

    if (!interactionApi || !hookApi) {
      log.error('Five9 interactionApi/hookApi not available');
      return;
    }

    // Refresh our Salesforce context opportunistically.
    async function refreshSalesforceContext() {
      const recordId = await getInFocusRecordId();
      const ctx = await deriveContextFromRecord(recordId);
      state.context = ctx;
      log.info('Salesforce context:', ctx);
      return ctx;
    }

    // Keep context fresh around call lifecycle events.
    interactionApi.subscribe({
      callStarted: async function () {
        try {
          await refreshSalesforceContext();
        } catch (e) {
          log.warn('refreshSalesforceContext failed on callStarted', e);
        }
      },
      callAccepted: async function () {
        try {
          await refreshSalesforceContext();
        } catch (e) {
          log.warn('refreshSalesforceContext failed on callAccepted', e);
        }
      },
    });

    hookApi.registerApi({
      beforeSaveLog: function () {
        const newFields = {};
        applyWhatWhoToLog(newFields);

        return Promise.resolve({
          status: { statusCode: Five9Sdk.CrmSdk.HookStatusCode.ProceedWithParams },
          newFields,
        });
      },
    });

    log.info('Initialized (Five9 hooks registered)');
  });
});
