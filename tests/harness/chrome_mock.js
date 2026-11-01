/**
 * chrome_mock.js - Complete Manifest V3 chrome.* API simulation for Peek Wave E2E testing
 * Pure Node.js implementation without external dependencies.
 */

class StorageArea {
  constructor(name, globalEmitter) {
    this.name = name;
    this._data = new Map();
    this._emitter = globalEmitter;
    this.simulateQuotaError = false;
  }

  get(keys, callback) {
    return new Promise((resolve, reject) => {
      const result = {};
      if (keys === null || keys === undefined) {
        for (const [k, v] of this._data.entries()) {
          result[k] = JSON.parse(JSON.stringify(v));
        }
      } else if (typeof keys === 'string') {
        if (this._data.has(keys)) {
          result[keys] = JSON.parse(JSON.stringify(this._data.get(keys)));
        }
      } else if (Array.isArray(keys)) {
        for (const k of keys) {
          if (this._data.has(k)) {
            result[k] = JSON.parse(JSON.stringify(this._data.get(k)));
          }
        }
      } else if (typeof keys === 'object') {
        for (const [k, defaultVal] of Object.entries(keys)) {
          result[k] = this._data.has(k)
            ? JSON.parse(JSON.stringify(this._data.get(k)))
            : defaultVal;
        }
      }
      if (typeof callback === 'function') callback(result);
      resolve(result);
    });
  }

  set(items, callback) {
    return new Promise((resolve, reject) => {
      if (this.simulateQuotaError) {
        const err = new Error('QUOTA_BYTES_PER_ITEM quota exceeded');
        if (typeof callback === 'function') callback();
        return reject(err);
      }
      const clone = (val) => val !== undefined ? JSON.parse(JSON.stringify(val)) : undefined;
      const changes = {};
      for (const [k, v] of Object.entries(items)) {
        const oldRaw = this._data.get(k);
        const oldValue = clone(oldRaw);
        const newValue = clone(v);
        if (newValue !== undefined) {
          this._data.set(k, newValue);
        } else {
          this._data.delete(k);
        }
        changes[k] = { oldValue, newValue };
      }
      this._emitter._notifyChanges(changes, this.name);
      if (typeof callback === 'function') callback();
      resolve();
    });
  }

  remove(keys, callback) {
    return new Promise((resolve) => {
      const keysArray = Array.isArray(keys) ? keys : [keys];
      const changes = {};
      for (const k of keysArray) {
        if (this._data.has(k)) {
          const oldValue = JSON.parse(JSON.stringify(this._data.get(k)));
          this._data.delete(k);
          changes[k] = { oldValue, newValue: undefined };
        }
      }
      this._emitter._notifyChanges(changes, this.name);
      if (typeof callback === 'function') callback();
      resolve();
    });
  }

  clear(callback) {
    return new Promise((resolve) => {
      const changes = {};
      for (const [k, v] of this._data.entries()) {
        changes[k] = { oldValue: v, newValue: undefined };
      }
      this._data.clear();
      this._emitter._notifyChanges(changes, this.name);
      if (typeof callback === 'function') callback();
      resolve();
    });
  }
}

class StorageChangeEmitter {
  constructor() {
    this._listeners = new Set();
  }

  addListener(listener) {
    if (typeof listener === 'function') {
      this._listeners.add(listener);
    }
  }

  removeListener(listener) {
    this._listeners.delete(listener);
  }

  _notifyChanges(changes, areaName) {
    if (Object.keys(changes).length === 0) return;
    for (const listener of this._listeners) {
      try {
        listener(changes, areaName);
      } catch (err) {
        console.error('Error in chrome.storage.onChanged listener:', err);
      }
    }
  }
}

class RuntimeEmitter {
  constructor() {
    this._listeners = new Set();
  }

  addListener(listener) {
    if (typeof listener === 'function') {
      this._listeners.add(listener);
    }
  }

  removeListener(listener) {
    this._listeners.delete(listener);
  }

  _dispatch(message, sender, sendResponse) {
    let responded = false;
    const responseCallback = (res) => {
      responded = true;
      sendResponse(res);
    };

    for (const listener of this._listeners) {
      try {
        const asyncHandled = listener(message, sender, responseCallback);
        if (asyncHandled === true) {
          return true;
        }
      } catch (err) {
        console.error('Error in chrome.runtime.onMessage listener:', err);
      }
    }
    return responded;
  }
}

class ChromeMock {
  constructor(initialSettings = {}) {
    this._storageEmitter = new StorageChangeEmitter();
    this.storage = {
      sync: new StorageArea('sync', this._storageEmitter),
      local: new StorageArea('local', this._storageEmitter),
      onChanged: this._storageEmitter
    };

    // Initialize default settings in sync storage
    const defaultSettings = {
      enabled: true,
      modifierKey: 'shift',
      sizePreset: 'default',
      ...initialSettings
    };
    for (const [k, v] of Object.entries(defaultSettings)) {
      this.storage.sync._data.set(k, v);
    }

    this.createdTabs = [];
    this.tabs = {
      create: (createProperties, callback) => {
        return new Promise((resolve) => {
          const tab = {
            id: Math.floor(Math.random() * 10000) + 1,
            url: createProperties.url,
            active: createProperties.active ?? true,
            windowId: 1
          };
          this.createdTabs.push(tab);
          if (typeof callback === 'function') callback(tab);
          resolve(tab);
        });
      }
    };

    this.runtime = {
      lastError: null,
      onMessage: new RuntimeEmitter(),
      sendMessage: (message, responseCallback) => {
        return new Promise((resolve) => {
          const sender = { id: 'peek-wave-test-ext', tab: { id: 1 } };
          let asyncFlag = false;
          let settled = false;

          const finish = (response) => {
            if (settled) return;
            settled = true;
            if (typeof responseCallback === 'function') responseCallback(response);
            resolve(response);
          };

          // Route to registered listeners (simulating background worker)
          asyncFlag = this.runtime.onMessage._dispatch(message, sender, finish);
          if (!asyncFlag && !settled) {
            finish({ received: true });
          }
        });
      },
      getURL: (path) => `chrome-extension://peek-wave-test-id/${path.replace(/^\//, '')}`
    };

    this.declarativeNetRequest = {
      _staticRules: [],
      setStaticRules: (rules) => {
        this.declarativeNetRequest._staticRules = rules;
      },
      testMatch: (url, resourceType) => {
        // Evaluates whether sub_frame rule strips headers
        const matchedRules = [];
        for (const rule of this.declarativeNetRequest._staticRules) {
          if (rule.condition && rule.condition.resourceTypes) {
            if (rule.condition.resourceTypes.includes(resourceType)) {
              matchedRules.push(rule);
            }
          }
        }
        return matchedRules;
      }
    };
  }
}

function createChromeMock(initialSettings = {}) {
  return new ChromeMock(initialSettings);
}

module.exports = {
  ChromeMock,
  createChromeMock
};
