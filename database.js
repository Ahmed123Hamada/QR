/**
 * Database Manager - IndexedDB Implementation
 * Built-in database for the entire application
 * Similar to SQLite but using browser's IndexedDB
 */

class DatabaseManager {
  constructor(dbName = 'QRAppDB', version = 1) {
    this.dbName = dbName;
    this.version = version;
    this.db = null;
    this.initPromise = null;
  }

  // Initialize database
  async init() {
    // If already initialized, return the existing database
    if (this.db) {
      return Promise.resolve(this.db);
    }

    // If initialization is in progress, wait for it
    if (this.initPromise) {
      return this.initPromise;
    }

    // Create new initialization promise
    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        console.error('❌ IndexedDB open error:', request.error);
        this.initPromise = null; // Clear promise on error
        reject(new Error('Failed to open database: ' + request.error.message));
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('✅ IndexedDB opened successfully');
        this.initPromise = null; // Clear promise after success
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Users table
        if (!db.objectStoreNames.contains('users')) {
          const usersStore = db.createObjectStore('users', { keyPath: 'id', autoIncrement: true });
          usersStore.createIndex('email', 'email', { unique: true });
          usersStore.createIndex('phone', 'phone', { unique: false });
          usersStore.createIndex('status', 'status', { unique: false });
          usersStore.createIndex('purchaseDate', 'purchaseDate', { unique: false });
        }

        // Products table
        if (!db.objectStoreNames.contains('products')) {
          const productsStore = db.createObjectStore('products', { keyPath: 'id', autoIncrement: true });
          productsStore.createIndex('name', 'name', { unique: false });
          productsStore.createIndex('price', 'price', { unique: false });
        }

        // Subscriptions table
        if (!db.objectStoreNames.contains('subscriptions')) {
          const subscriptionsStore = db.createObjectStore('subscriptions', { keyPath: 'id', autoIncrement: true });
          subscriptionsStore.createIndex('userId', 'userId', { unique: false });
          subscriptionsStore.createIndex('tier', 'tier', { unique: false });
          subscriptionsStore.createIndex('expiryDate', 'expiryDate', { unique: false });
        }

        // Codes table (Admin and Viewer codes)
        if (!db.objectStoreNames.contains('codes')) {
          const codesStore = db.createObjectStore('codes', { keyPath: 'id', autoIncrement: true });
          codesStore.createIndex('userId', 'userId', { unique: false });
          codesStore.createIndex('code', 'code', { unique: true });
          codesStore.createIndex('type', 'type', { unique: false }); // 'admin' or 'viewer'
          codesStore.createIndex('isActive', 'isActive', { unique: false });
        }

        // Purchases table
        if (!db.objectStoreNames.contains('purchases')) {
          const purchasesStore = db.createObjectStore('purchases', { keyPath: 'id', autoIncrement: true });
          purchasesStore.createIndex('userId', 'userId', { unique: false });
          purchasesStore.createIndex('productId', 'productId', { unique: false });
          purchasesStore.createIndex('purchaseDate', 'purchaseDate', { unique: false });
          purchasesStore.createIndex('status', 'status', { unique: false });
        }

        // QR Codes table
        if (!db.objectStoreNames.contains('qrCodes')) {
          const qrStore = db.createObjectStore('qrCodes', { keyPath: 'id', autoIncrement: true });
          qrStore.createIndex('userId', 'userId', { unique: false });
          qrStore.createIndex('type', 'type', { unique: false });
          qrStore.createIndex('createdDate', 'createdDate', { unique: false });
        }

        // Settings table
        if (!db.objectStoreNames.contains('settings')) {
          const settingsStore = db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
    });
  }

  // Generic CRUD operations
  async add(storeName, data) {
    return new Promise((resolve, reject) => {
      try {
        if (!this.db) {
          reject(new Error('Database not initialized'));
          return;
        }

        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.add(data);

        let resolved = false;
        
        request.onsuccess = () => {
          const id = request.result;
          console.log(`✅ Added to ${storeName} with ID:`, id);
          
          // Wait for transaction to complete before resolving
          transaction.oncomplete = () => {
            if (!resolved) {
              console.log(`✅ Transaction completed for ${storeName}`);
              resolved = true;
              resolve(id);
            }
          };
          
          // Fallback: resolve after a short delay if transaction completes quickly
          // This handles cases where oncomplete might not fire in some browsers
          setTimeout(() => {
            if (!resolved && transaction.readyState === 'done') {
              console.log(`✅ Transaction done (fallback) for ${storeName}`);
              resolved = true;
              resolve(id);
            }
          }, 50);
        };
        
        request.onerror = () => {
          console.error(`❌ IndexedDB add error for ${storeName}:`, request.error, 'Data:', data);
          reject(request.error);
        };

        transaction.onerror = () => {
          console.error(`❌ IndexedDB transaction error for ${storeName}:`, transaction.error);
          reject(transaction.error);
        };

        transaction.onabort = () => {
          console.error(`❌ IndexedDB transaction aborted for ${storeName}`);
          reject(new Error('Transaction aborted'));
        };
      } catch (error) {
        console.error(`❌ Error in add for ${storeName}:`, error);
        reject(error);
      }
    });
  }

  async get(storeName, key) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(storeName, indexName = null, query = null) {
    return new Promise((resolve, reject) => {
      try {
        if (!this.db) {
          reject(new Error('Database not initialized'));
          return;
        }

        const transaction = this.db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        
        let request;
        if (indexName && query !== null && query !== undefined) {
          // Use index with query
          const index = store.index(indexName);
          if (typeof query === 'object') {
            // Range query
            request = index.getAll(query);
          } else {
            // Single value query
            request = index.getAll(query);
          }
        } else if (indexName) {
          // Use index without query (get all from index)
          const index = store.index(indexName);
          request = index.getAll();
        } else {
          // Get all from store
          request = store.getAll();
        }

        request.onsuccess = () => {
          const results = request.result || [];
          console.log(`📊 getAll('${storeName}'): Retrieved ${results.length} items`);
          resolve(results);
        };
        
        request.onerror = () => {
          console.error(`❌ IndexedDB getAll error for ${storeName}:`, request.error);
          reject(request.error);
        };

        transaction.onerror = () => {
          console.error(`❌ IndexedDB transaction error for ${storeName}:`, transaction.error);
          reject(transaction.error);
        };
      } catch (error) {
        console.error(`❌ Error in getAll for ${storeName}:`, error);
        reject(error);
      }
    });
  }

  async update(storeName, data) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(storeName, key) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  async count(storeName, indexName = null, query = null) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const source = indexName ? store.index(indexName) : store;
      const request = query ? source.count(query) : source.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // ===== Users Operations =====
  async addUser(userData) {
    const user = {
      name: userData.name,
      email: userData.email,
      phone: userData.phone,
      product: userData.product || '',
      purchaseDate: userData.purchaseDate || new Date().toISOString(),
      expiryDate: userData.expiryDate || null,
      amount: userData.amount || 0,
      status: userData.status || 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    return this.add('users', user);
  }

  async getUser(userId) {
    return this.get('users', userId);
  }

  async getUserByEmail(email) {
    const users = await this.getAll('users', 'email', email);
    return users.length > 0 ? users[0] : null;
  }

  async getAllUsers() {
    if (!this.db) {
      await this.init();
    }
    
    try {
      console.log('🔍 getAllUsers: Fetching from database...');
      const users = await this.getAll('users');
      console.log(`🔍 getAllUsers: Retrieved ${users ? users.length : 0} users`);
      return users || [];
    } catch (error) {
      console.error('❌ Error in getAllUsers:', error);
      return [];
    }
  }

  async updateUser(userId, userData) {
    const user = await this.getUser(userId);
    if (!user) throw new Error('User not found');

    const updated = {
      ...user,
      ...userData,
      updatedAt: new Date().toISOString()
    };
    return this.update('users', updated);
  }

  async deleteUser(userId) {
    // Also delete related codes and subscriptions
    await this.deleteUserCodes(userId);
    await this.deleteUserSubscriptions(userId);
    return this.delete('users', userId);
  }

  // ===== Codes Operations =====
  async addCode(codeData) {
    const code = {
      userId: codeData.userId,
      code: codeData.code,
      type: codeData.type, // 'admin' or 'viewer'
      isActive: codeData.isActive !== false,
      createdAt: new Date().toISOString(),
      expiresAt: codeData.expiresAt || null
    };
    return this.add('codes', code);
  }

  async getCode(codeString) {
    const codes = await this.getAll('codes', 'code', codeString);
    return codes.length > 0 ? codes[0] : null;
  }

  // Verify code and return user information
  async verifyCode(codeString) {
    if (!this.db) {
      await this.init();
    }

    try {
      const code = await this.getCode(codeString);
      
      if (!code || !code.isActive) {
        return { ok: false, message: 'INVALID' };
      }

      // Get user information
      const user = await this.getUser(code.userId);
      if (!user) {
        return { ok: false, message: 'USER_NOT_FOUND' };
      }

      // Check if user subscription is still valid
      const now = Date.now();
      const expiryDate = user.expiryDate ? new Date(user.expiryDate).getTime() : null;
      
      if (expiryDate && expiryDate < now) {
        return { ok: false, message: 'EXPIRED' };
      }

      // Get both codes for the user
      const userCodes = await this.getUserCodes(code.userId);
      const adminCode = userCodes.find(c => c.type === 'admin' && c.isActive);
      const viewerCode = userCodes.find(c => c.type === 'viewer' && c.isActive);

      // Determine role based on code type
      const role = code.type === 'admin' ? 'admin' : 'viewer';
      
      // Calculate expiry time (default to 6 months if no expiry date)
      const until = expiryDate || (now + 180 * 24 * 60 * 60 * 1000);

      // Determine tier based on product
      let tier = 'Basic-3';
      if (user.product && user.product.includes('6')) {
        tier = 'Pro-6';
      } else if (user.product && user.product.includes('سنوي') || user.product.includes('Yearly')) {
        tier = 'Pro-12';
      }

      return {
        ok: true,
        role: role,
        until: until,
        tier: tier,
        codes: {
          admin: adminCode ? adminCode.code : '',
          viewer: viewerCode ? viewerCode.code : ''
        },
        payload: {
          userId: user.id,
          name: user.name,
          email: user.email,
          product: user.product
        }
      };
    } catch (error) {
      console.error('Error verifying code:', error);
      return { ok: false, message: 'ERROR' };
    }
  }

  async getUserCodes(userId, type = null) {
    if (!this.db) {
      await this.init();
    }
    
    try {
      const codes = await this.getAll('codes', 'userId', userId);
      const filtered = type ? codes.filter(c => c.type === type && c.isActive) : codes.filter(c => c.isActive);
      return filtered;
    } catch (error) {
      console.error('Error getting user codes:', error);
      // Fallback: try without index
      try {
        const allCodes = await this.getAll('codes');
        const userCodes = allCodes.filter(c => c.userId === userId && c.isActive);
        return type ? userCodes.filter(c => c.type === type) : userCodes;
      } catch (e) {
        console.error('Fallback also failed:', e);
        return [];
      }
    }
  }

  async updateCode(codeId, codeData) {
    const code = await this.get('codes', codeId);
    if (!code) throw new Error('Code not found');

    const updated = {
      ...code,
      ...codeData,
      updatedAt: new Date().toISOString()
    };
    return this.update('codes', updated);
  }

  async deleteCode(codeId) {
    return this.delete('codes', codeId);
  }

  async deleteUserCodes(userId) {
    const codes = await this.getUserCodes(userId);
    const promises = codes.map(code => this.deleteCode(code.id));
    return Promise.all(promises);
  }

  async generateCodesForUser(userId) {
    // Ensure database is ready
    if (!this.db) {
      await this.init();
    }

    try {
      // Deactivate existing codes for this user
      const existingCodes = await this.getUserCodes(userId);
      for (const code of existingCodes) {
        if (code.isActive) {
          await this.updateCode(code.id, { isActive: false });
        }
      }

      // Generate unique codes
      let adminCode, viewerCode;
      let attempts = 0;
      const maxAttempts = 10;

      // Ensure unique admin code
      do {
        adminCode = this.generateCode('admin');
        const existing = await this.getCode(adminCode);
        if (!existing) break;
        attempts++;
      } while (attempts < maxAttempts);

      attempts = 0;
      // Ensure unique viewer code
      do {
        viewerCode = this.generateCode('viewer');
        const existing = await this.getCode(viewerCode);
        if (!existing) break;
        attempts++;
      } while (attempts < maxAttempts);

      // Add new codes with proper error handling
      const adminCodeId = await this.addCode({
        userId: userId,
        code: adminCode,
        type: 'admin',
        isActive: true
      });

      const viewerCodeId = await this.addCode({
        userId: userId,
        code: viewerCode,
        type: 'viewer',
        isActive: true
      });

      // Wait a bit for IndexedDB to commit the transaction
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify codes were saved by retrieving them using code string (more reliable)
      let verifyAdmin = await this.getCode(adminCode);
      let verifyViewer = await this.getCode(viewerCode);
      
      // If not found by code, try by ID
      if (!verifyAdmin) {
        verifyAdmin = await this.get('codes', adminCodeId);
      }
      if (!verifyViewer) {
        verifyViewer = await this.get('codes', viewerCodeId);
      }

      if (!verifyAdmin || !verifyViewer) {
        // Last attempt: wait more and retry
        await new Promise(resolve => setTimeout(resolve, 300));
        verifyAdmin = await this.getCode(adminCode);
        verifyViewer = await this.getCode(viewerCode);
        
        if (!verifyAdmin || !verifyViewer) {
          console.error('❌ Code verification failed after retry:', { 
            adminCode, 
            viewerCode, 
            adminCodeId, 
            viewerCodeId,
            verifyAdmin: !!verifyAdmin,
            verifyViewer: !!verifyViewer
          });
          throw new Error('Failed to save codes to database - verification failed');
        }
      }

      console.log('✅ Codes saved and verified successfully:', { 
        adminCode, 
        viewerCode, 
        adminCodeId, 
        viewerCodeId,
        adminVerified: !!verifyAdmin,
        viewerVerified: !!verifyViewer
      });

      return { adminCode, viewerCode };
    } catch (error) {
      console.error('Error in generateCodesForUser:', error);
      throw error;
    }
  }

  generateCode(type = 'admin') {
    const prefix = type === 'admin' ? 'ADM' : 'VWR';
    const timestamp = Date.now().toString(36).slice(-4).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${timestamp}${random}`;
  }

  // ===== Products Operations =====
  async addProduct(productData) {
    const product = {
      name: productData.name || {},
      desc: productData.desc || {},
      price: productData.price || 0,
      img: productData.img || '',
      category: productData.category || '',
      isActive: productData.isActive !== false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    return this.add('products', product);
  }

  async getAllProducts() {
    return this.getAll('products');
  }

  async getProduct(productId) {
    return this.get('products', productId);
  }

  async updateProduct(productId, productData) {
    const product = await this.getProduct(productId);
    if (!product) throw new Error('Product not found');

    const updated = {
      ...product,
      ...productData,
      updatedAt: new Date().toISOString()
    };
    return this.update('products', updated);
  }

  async deleteProduct(productId) {
    return this.delete('products', productId);
  }

  // ===== Subscriptions Operations =====
  async addSubscription(subscriptionData) {
    const subscription = {
      userId: subscriptionData.userId,
      tier: subscriptionData.tier || 'Basic',
      startDate: subscriptionData.startDate || new Date().toISOString(),
      expiryDate: subscriptionData.expiryDate,
      isActive: subscriptionData.isActive !== false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    return this.add('subscriptions', subscription);
  }

  async getUserSubscription(userId) {
    const subscriptions = await this.getAll('subscriptions', 'userId', userId);
    return subscriptions.length > 0 ? subscriptions[0] : null;
  }

  async updateSubscription(subscriptionId, subscriptionData) {
    const subscription = await this.get('subscriptions', subscriptionId);
    if (!subscription) throw new Error('Subscription not found');

    const updated = {
      ...subscription,
      ...subscriptionData,
      updatedAt: new Date().toISOString()
    };
    return this.update('subscriptions', updated);
  }

  async deleteUserSubscriptions(userId) {
    const subscriptions = await this.getAll('subscriptions', 'userId', userId);
    const promises = subscriptions.map(sub => this.delete('subscriptions', sub.id));
    return Promise.all(promises);
  }

  // ===== Purchases Operations =====
  async addPurchase(purchaseData) {
    const purchase = {
      userId: purchaseData.userId,
      productId: purchaseData.productId,
      amount: purchaseData.amount || 0,
      purchaseDate: purchaseData.purchaseDate || new Date().toISOString(),
      status: purchaseData.status || 'completed',
      paymentMethod: purchaseData.paymentMethod || '',
      createdAt: new Date().toISOString()
    };
    return this.add('purchases', purchase);
  }

  async getUserPurchases(userId) {
    return this.getAll('purchases', 'userId', userId);
  }

  async getAllPurchases() {
    return this.getAll('purchases');
  }

  // ===== QR Codes Operations =====
  async saveQRCode(qrData) {
    const qr = {
      userId: qrData.userId || null,
      type: qrData.type || 'text',
      data: qrData.data || '',
      settings: qrData.settings || {},
      createdDate: new Date().toISOString()
    };
    return this.add('qrCodes', qr);
  }

  async getUserQRCodes(userId) {
    return this.getAll('qrCodes', 'userId', userId);
  }

  // ===== Settings Operations =====
  async getSetting(key) {
    const setting = await this.get('settings', key);
    return setting ? setting.value : null;
  }

  async setSetting(key, value) {
    return this.update('settings', { key, value, updatedAt: new Date().toISOString() });
  }

  // ===== Statistics =====
  async getStats() {
    const [totalUsers, activeUsers, allUsers, totalProducts] = await Promise.all([
      this.count('users'),
      this.count('users', 'status', 'active'),
      this.getAllUsers(),
      this.count('products')
    ]);

    // Calculate total revenue from users' amounts
    const totalRevenue = allUsers.reduce((sum, user) => sum + (parseFloat(user.amount) || 0), 0);

    return {
      totalUsers,
      activeUsers,
      pendingUsers: totalUsers - activeUsers,
      totalRevenue,
      totalProducts
    };
  }

  // ===== Export/Import =====
  async exportData() {
    const [users, products, subscriptions, codes, purchases, qrCodes, settings] = await Promise.all([
      this.getAllUsers(),
      this.getAllProducts(),
      this.getAll('subscriptions'),
      this.getAll('codes'),
      this.getAllPurchases(),
      this.getAll('qrCodes'),
      this.getAll('settings')
    ]);

    return {
      version: this.version,
      exportDate: new Date().toISOString(),
      data: {
        users,
        products,
        subscriptions,
        codes,
        purchases,
        qrCodes,
        settings
      }
    };
  }

  async importData(data) {
    const transaction = this.db.transaction([
      'users', 'products', 'subscriptions', 'codes', 'purchases', 'qrCodes', 'settings'
    ], 'readwrite');

    const promises = [];

    if (data.users) {
      data.users.forEach(user => {
        promises.push(transaction.objectStore('users').put(user));
      });
    }

    if (data.products) {
      data.products.forEach(product => {
        promises.push(transaction.objectStore('products').put(product));
      });
    }

    if (data.subscriptions) {
      data.subscriptions.forEach(sub => {
        promises.push(transaction.objectStore('subscriptions').put(sub));
      });
    }

    if (data.codes) {
      data.codes.forEach(code => {
        promises.push(transaction.objectStore('codes').put(code));
      });
    }

    if (data.purchases) {
      data.purchases.forEach(purchase => {
        promises.push(transaction.objectStore('purchases').put(purchase));
      });
    }

    if (data.qrCodes) {
      data.qrCodes.forEach(qr => {
        promises.push(transaction.objectStore('qrCodes').put(qr));
      });
    }

    if (data.settings) {
      data.settings.forEach(setting => {
        promises.push(transaction.objectStore('settings').put(setting));
      });
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
    });
  }

  // ===== Clear Database =====
  async clearDatabase() {
    const stores = ['users', 'products', 'subscriptions', 'codes', 'purchases', 'qrCodes', 'settings'];
    const transaction = this.db.transaction(stores, 'readwrite');

    stores.forEach(storeName => {
      transaction.objectStore(storeName).clear();
    });

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
    });
  }
}

// Create global instance
const db = new DatabaseManager();

// Initialize on load
if (typeof window !== 'undefined') {
  db.init().then(() => {
    console.log('✅ Database initialized successfully');
  }).catch(err => {
    console.error('❌ Database initialization failed:', err);
  });
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DatabaseManager;
}

