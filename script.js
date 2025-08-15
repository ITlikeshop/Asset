<<<<<<< HEAD
// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getDatabase, ref, set, onValue, remove, update } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js";

// Main application object
const App = {
    // State properties
    currentUser: null,
    assets: [],
    departments: [],
    filteredAssets: [],
    currentPage: 1,
    itemsPerPage: 10,
    db: null,
    charts: { department: null, status: null, assetType: null },
    dataLoaded: { assets: false, departments: false },

    // Firebase configuration
    firebaseConfig: {
        apiKey: "AIzaSyC-kxyl1HBdQB_z2a6zQp8U-sSR3leepEw",
        authDomain: "assetit-6ae96.firebaseapp.com",
        databaseURL: "https://assetit-6ae96-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "assetit-6ae96",
        storageBucket: "assetit-6ae96.appspot.com",
        messagingSenderId: "108986650061",
        appId: "1:108986650061:web:c2511da39ef6bbe00c4884",
    },

    // Application constants (using Thai names as in the UI)
    assetTypes: { 
        'PC': 'คอมพิวเตอร์ตั้งโต๊ะ', 
        'NB': 'โน้ตบุ๊ก', 
        'KB': 'คีย์บอร์ด', 
        'MU': 'เมาส์', 
        'MT': 'จอภาพ', 
        'PH': 'โทรศัพท์', 
        'PT': 'เครื่องพิมพ์', 
        'AF': 'เครื่องฟอกอากาศ', 
        'CAM': 'กล้อง', 
        'EP': 'หูฟัง', 
        'LT': 'ไฟ', 
        'MIC': 'ไมโครโฟน', 
        'OT': 'อื่นๆ' 
    },
    assetStatuses: ["ปกติ", "สำรอง", "เสีย", "หาไม่เจอ"],

    // --- INITIALIZATION ---
    init() {
        // Initialize Firebase
        try {
            const firebaseApp = initializeApp(this.firebaseConfig);
            this.db = getDatabase(firebaseApp);
        } catch (error) {
            console.error("Firebase initialization failed:", error);
            this.showToast("การเชื่อมต่อฐานข้อมูลล้มเหลว", "error");
            return;
        }
        // Load initial data and set up event listeners
        this.loadDepartments();
        this.addEventListeners();
    },

    addEventListeners() {
        // Login
        document.getElementById('loginForm').addEventListener('submit', (e) => { e.preventDefault(); this.login(); });
        
        // Filters
        document.getElementById('assetSearch').addEventListener('input', () => this.filterAssets());
        ['departmentFilter', 'statusFilter', 'typeFilter'].forEach(id => {
            document.getElementById(id).addEventListener('change', () => this.filterAssets());
        });

        // Asset Form
        document.getElementById('assetForm').addEventListener('submit', (e) => { e.preventDefault(); this.saveAsset(); });
        document.getElementById('assetType').addEventListener('change', () => this.generateAssetId());

        // Pagination
        document.getElementById('prevPage').addEventListener('click', () => this.goToPrevPage());
        document.getElementById('nextPage').addEventListener('click', () => this.goToNextPage());

        // Department Management
        document.getElementById('addDepartmentForm').addEventListener('submit', (e) => { e.preventDefault(); this.addDepartment(); });
        document.getElementById('importBtn').addEventListener('click', () => this.importAssetsFromExcel());
    },
    
    importAssetsFromExcel() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.xlsx,.xls';

        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(sheet);

                jsonData.forEach(asset => {
                    if (asset.ID) {
                        set(ref(this.db, 'assets/' + asset.ID), {
                            name: asset.ชื่อทรัพย์สิน || '',
                            username: asset.ผู้ใช้งาน || '',
                            nickname: asset.ชื่อเล่น || '',
                            type: asset.ประเภท || '',
                            serial: asset.Serial || '',
                            department: asset.แผนก || '',
                            purchaseDate: asset.วันที่ซื้อ || '',
                            status: asset.สถานะ || '',
                            lastCheck: asset.เช็คล่าสุด || '',
                            specs: asset.สเปค || '',
                            notes: asset.หมายเหตุ || ''
                        });
                    }
                });

                this.showToast('นำเข้าข้อมูลสำเร็จ', 'success');
                this.loadInitialData();
            };
            reader.readAsArrayBuffer(file);
        });

        input.click();
    },

    // --- DATA LOADING & AUTHENTICATION ---
    loadDepartments() {
        const departmentsRef = ref(this.db, 'departments/');
        onValue(departmentsRef, (snapshot) => {
            const data = snapshot.val();
            let depts = data ? Object.keys(data) : [];
            // If no departments exist, initialize with 'IT'
            if (depts.length === 0 && !this.dataLoaded.departments) {
                const initialDepRef = ref(this.db, 'departments/IT');
                set(initialDepRef, true);
                depts = ['IT'];
            }
            this.departments = depts;
            this.dataLoaded.departments = true;
            this.populateDropdowns();
            // If department page is active, re-render the list
            if (document.getElementById('departmentPage')?.classList.contains('hidden') === false) {
                this.renderDepartmentList();
            }
        }, (error) => {
            console.error("Failed to load departments:", error);
            this.showToast("โหลดรายชื่อแผนกไม่สำเร็จ", "error");
        });
    },

    loadInitialData() {
        this.showLoader();
        this.dataLoaded.assets = false;
        const assetsRef = ref(this.db, 'assets/');
        
        // Timeout to prevent infinite loading screen on connection issues
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("การเชื่อมต่อใช้เวลานานเกินไป")), 10000));
        
        const dataPromise = new Promise((resolve, reject) => {
            onValue(assetsRef, (snapshot) => {
                const data = snapshot.val();
                this.assets = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
                this.dataLoaded.assets = true;
                resolve();
            }, (error) => reject(error));
        });

        Promise.race([dataPromise, timeoutPromise])
            .then(() => this.showPage('dashboardPage')) // Show dashboard after data is loaded
            .catch((error) => {
                console.error("Failed to load initial data:", error);
                this.showToast(error.message, "error");
            })
            .finally(() => this.hideLoader());
    },

    login() {
        const department = document.getElementById('department').value;
        const password = document.getElementById('password').value.trim();
        if (!department) { this.showToast('กรุณารอรายชื่อแผนก', 'error'); return; }

        // Simple authentication logic
        if ((department === 'IT' && password === 'admin123') || (department !== 'IT' && password === '123456')) {
            this.currentUser = { department, isIT: department === 'IT' };
            this.showToast('เข้าสู่ระบบสำเร็จ', 'success');
            document.getElementById('loginModal').classList.add('hidden');
            document.getElementById('mainContent').classList.remove('hidden');
            this.updateUIForUser();
            this.loadInitialData();
        } else {
            this.showToast('ข้อมูลไม่ถูกต้อง', 'error');
        }
    },

    logout() {
        // Reset all state variables
        this.currentUser = null; this.assets = []; this.filteredAssets = []; this.currentPage = 1;
        this.dataLoaded = { assets: false, departments: true };
        
        // Show login screen and hide main content
        document.getElementById('loginModal').classList.remove('hidden');
        document.getElementById('mainContent').classList.add('hidden');
        this.showPage(null); // Hide all pages
    },

    // --- UI RENDERING & UPDATES ---
    populateDropdowns() {
        // Populate all department dropdowns
        const departmentSelects = [document.getElementById('department'), document.getElementById('departmentFilter'), document.getElementById('assetDepartment')];
        departmentSelects.forEach(select => {
            if (!select) return;
            const currentValue = select.value;
            select.innerHTML = ''; 
            if (select.id === 'departmentFilter') select.innerHTML += '<option value="all">ทุกแผนก</option>';
            if (this.departments.length === 0 && select.id === 'department') select.innerHTML = '<option disabled>ไม่พบแผนก</option>';
            this.departments.sort().forEach(dep => select.innerHTML += `<option value="${dep}">${dep}</option>`);
            select.value = currentValue;
        });

        // Populate Status and Type dropdowns only once
        if (document.getElementById('statusFilter').options.length <= 1) {
            const statusSelects = [document.getElementById('statusFilter'), document.getElementById('assetStatus')];
            statusSelects.forEach(select => {
                if (select.id === 'statusFilter') select.innerHTML = '<option value="all">ทุกสถานะ</option>';
                else select.innerHTML = '';
                this.assetStatuses.forEach(status => select.innerHTML += `<option value="${status}">${status}</option>`);
            });
            const typeSelects = [document.getElementById('typeFilter'), document.getElementById('assetType')];
            typeSelects.forEach(select => {
                if (select.id === 'typeFilter') select.innerHTML = '<option value="all">ทุกประเภท</option>';
                else select.innerHTML = '';
                for (const [code, name] of Object.entries(this.assetTypes)) {
                    select.innerHTML += `<option value="${code}">${name}</option>`;
                }
            });
        }
    },

    updateUIForUser() {
        if (!this.currentUser) return;
        document.getElementById('userDepartment').textContent = this.currentUser.department;
        const isIT = this.currentUser.isIT;

        // Toggle visibility of IT-only elements
        ['addAssetMenu', 'manageDepartmentMenu', 'importBtn', 'addAssetBtn'].forEach(id => {
            document.getElementById(id).classList.toggle('hidden', !isIT);
        });

        // Disable and pre-select department filter for non-IT users
        const departmentFilter = document.getElementById('departmentFilter');
        departmentFilter.disabled = !isIT;
        if (!isIT) {
            departmentFilter.value = this.currentUser.department;
        }
    },

    showPage(pageId) {
        // Hide all pages first
        ['dashboardPage', 'assetListPage', 'assetFormPage', 'departmentPage'].forEach(id => {
            document.getElementById(id).classList.add('hidden');
        });

        if (pageId) {
            // If data is not ready, show loader and abort
            if (!this.dataLoaded.assets || !this.dataLoaded.departments) { 
                this.showLoader(); 
                return; 
            }
            this.hideLoader();
            
            // Show the requested page
            document.getElementById(pageId).classList.remove('hidden');
            
            // Update the page title for mobile view
            const title = {
                dashboardPage: 'แดชบอร์ด',
                assetListPage: 'รายการทรัพย์สิน',
                assetFormPage: document.getElementById('formTitle').textContent || 'จัดการทรัพย์สิน',
                departmentPage: 'จัดการแผนก'
            }[pageId];
            document.getElementById('pageTitle').textContent = title;
            document.getElementById('userJA').textContent = this.currentUser.department;

            // Run page-specific logic
            if (pageId === 'dashboardPage') this.updateDashboard();
            if (pageId === 'assetListPage') this.filterAssets();
            if (pageId === 'departmentPage') this.renderDepartmentList();
        }
        this.toggleMobileMenu(true); // Always close mobile menu on page change
    },

    toggleMobileMenu(forceClose = false) {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        const isOpen = !sidebar.classList.contains('-translate-x-full');
        if (forceClose || isOpen) {
            sidebar.classList.add('-translate-x-full');
            overlay.classList.add('hidden');
        } else {
            sidebar.classList.remove('-translate-x-full');
            overlay.classList.remove('hidden');
        }
    },
    
    renderAssetTable() {
        const tableBody = document.getElementById('assetTable');
        tableBody.innerHTML = '';
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const paginatedAssets = this.filteredAssets.slice(startIndex, startIndex + this.itemsPerPage);

        if (paginatedAssets.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-gray-500 block w-full">ไม่พบข้อมูล</td></tr>`;
            this.updatePaginationControls();
            return;
        }
        
        paginatedAssets.forEach(asset => {
            const row = document.createElement('tr');

            // IT-only delete button
            const itOnlyActions = this.currentUser.isIT ? `<button onclick="App.deleteAsset('${asset.id}')" class="text-red-500 hover:text-red-700" title="ลบ"><i class="fas fa-trash"></i></button>` : '';
            
            row.innerHTML = `
                <td data-label="ID:" class="px-6 py-4 font-medium text-gray-900">${asset.id || '-'}</td>
                <td data-label="ชื่อทรัพย์สิน:" class="px-6 py-4 text-gray-600">${asset.name || '-'}</td>
                <td data-label="ผู้ใช้:" class="px-6 py-4 text-gray-600">${asset.nickname || '-'}</td>
                <td data-label="แผนก:" class="px-6 py-4 text-gray-600">${asset.department || '-'}</td>
                <td data-label="ประเภท:" class="px-6 py-4"><span class="type-badge type-${asset.type || 'OT'}">${this.assetTypes[asset.type] || asset.type || 'ไม่ระบุ'}</span></td>
                <td data-label="สถานะ:" class="px-6 py-4"><span class="status-badge status-${asset.status || 'หาไม่เจอ'}">${asset.status || 'N/A'}</span></td>
                <td class="px-6 py-4 space-x-4 flex justify-end items-center">
                    <button onclick="App.showAssetDetailModal('${asset.id}')" class="text-gray-500 hover:text-gray-700" title="ดูรายละเอียด"><i class="fas fa-eye"></i></button>
                    <button onclick="App.showEditAsset('${asset.id}')" class="text-blue-500 hover:text-blue-700" title="แก้ไข"><i class="fas fa-edit"></i></button>
                    ${itOnlyActions}
                </td>`;
            tableBody.appendChild(row);
        });
        this.updatePaginationControls();
    },

    updatePaginationControls() {
        const total = this.filteredAssets.length;
        const start = total > 0 ? (this.currentPage - 1) * this.itemsPerPage + 1 : 0;
        const end = Math.min(start + this.itemsPerPage - 1, total);
        document.getElementById('startItem').textContent = start;
        document.getElementById('endItem').textContent = end;
        document.getElementById('totalItems').textContent = total;
        document.getElementById('prevPage').disabled = this.currentPage === 1;
        document.getElementById('nextPage').disabled = end >= total;
    },

    goToPrevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.renderAssetTable();
        }
    },

    goToNextPage() {
        if (this.currentPage * this.itemsPerPage < this.filteredAssets.length) {
            this.currentPage++;
            this.renderAssetTable();
        }
    },
    
    updateDashboard() {
        // Filter assets based on user's department if not IT
        let assetsData = this.currentUser.isIT ? this.assets : this.assets.filter(a => a.department === this.currentUser.department);
        
        // Update summary cards
        document.getElementById('totalAssets').textContent = assetsData.length;
        this.assetStatuses.forEach(status => {
            const count = assetsData.filter(a => a.status === status).length;
            const elId = {'ปกติ': 'activeAssets', 'เสีย': 'brokenAssets', 'สำรอง': 'reserveAssets', 'หาไม่เจอ': 'disappearAssets'}[status];
            if(elId) document.getElementById(elId).textContent = count;
        });
        
        // Update charts
        this.updateChart('department', assetsData);
        this.updateChart('status', assetsData);
        this.updateChart('assetType', assetsData);
    },

    updateChart(type, data) {
        const canvas = document.getElementById(`${type}Chart`);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (this.charts[type]) this.charts[type].destroy(); // Destroy previous chart instance

        // Aggregate data for the chart
        const counts = data.reduce((acc, asset) => {
            let key;
            if (type === 'department') {
                key = asset.department || 'ไม่ระบุ';
            } else if (type === 'status') {
                key = asset.status || 'ไม่ระบุ';
            } else if (type === 'assetType') {
                key = this.assetTypes[asset.type] || asset.type || 'ไม่ระบุ';
            }
            
            if (key) {
                acc[key] = (acc[key] || 0) + 1;
            }
            return acc;
        }, {});

        const labels = Object.keys(counts);
        const chartData = Object.values(counts);
        
        const statusColors = {'ปกติ': '#22c55e', 'สำรอง': '#f59e0b', 'เสีย': '#ef4444', 'หาไม่เจอ': '#6b7280', 'ไม่ระบุ': '#9ca3af'};
        const genericColors = ['#3b82f6', '#10b981', '#f97316', '#8b5cf6', '#ec4899', '#6366f1', '#f43f5e', '#06b6d4', '#d946ef', '#eab308', '#a16207', '#4d7c0f', '#be123c', '#0f766e'];
        
        const backgroundColors = type === 'status' ? labels.map(l => statusColors[l]) : genericColors;
        
        // Check if the chart should be a bar chart
        const isBarChart = type === 'department' || type === 'assetType';

        // Chart configuration
        this.charts[type] = new Chart(ctx, {
            type: isBarChart ? 'bar' : 'pie', // Set type to bar for department and assetType
            data: {
                labels,
                datasets: [{
                    label: `จำนวนทรัพย์สิน`,
                    data: chartData,
                    backgroundColor: backgroundColors,
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: isBarChart ? 'y' : 'x', // Horizontal bars for bar charts
                plugins: {
                    legend: { 
                        display: !isBarChart // Hide legend for all bar charts
                    },
                    tooltip: {
                        // Optional: Custom tooltips if needed
                    }
                },
                scales: isBarChart ? { 
                    y: { 
                        beginAtZero: true 
                    }, 
                    x: { 
                        ticks: { precision: 0 } // Ensure Y-axis shows whole numbers
                    } 
                } : {}
            }
        });
    },

    // --- ASSET CRUD OPERATIONS ---
    filterAssets() {
        const searchTerm = document.getElementById('assetSearch').value.toLowerCase();
        const department = document.getElementById('departmentFilter').value;
        const status = document.getElementById('statusFilter').value;
        const type = document.getElementById('typeFilter').value;

        this.filteredAssets = this.assets.filter(asset => {
            // Non-IT users can only see their own department's assets
            if (!this.currentUser.isIT && asset.department !== this.currentUser.department) {
                return false;
            }
            const matchesSearch = searchTerm === '' || Object.values(asset).some(val => String(val).toLowerCase().includes(searchTerm));
            const matchesDept = department === 'all' || asset.department === department;
            const matchesStatus = status === 'all' || asset.status === status;
            const matchesType = type === 'all' || asset.type === type;
            return matchesSearch && matchesDept && matchesStatus && matchesType;
        });
        this.currentPage = 1;
        this.renderAssetTable();
    },

    showAddAsset() {
        if (!this.currentUser || !this.currentUser.isIT) {
            this.showToast("คุณไม่มีสิทธิ์เพิ่มข้อมูล", "error");
            return;
        }
        document.getElementById('assetForm').reset();
        document.getElementById('formTitle').textContent = 'เพิ่มทรัพย์สินใหม่';
        document.getElementById('assetIdInput').value = '';
        this.setFormEditable(true); // Make all fields editable
        this.showPage('assetFormPage');
        this.generateAssetId(); // Generate an ID for the new asset
    },

    showEditAsset(assetId) {
        const asset = this.assets.find(a => a.id === assetId);
        if (!asset) { this.showToast("ไม่พบข้อมูล", "error"); return; }
        
        this.showPage('assetFormPage');
        document.getElementById('formTitle').textContent = 'แก้ไขข้อมูลทรัพย์สิน';
        document.getElementById('assetForm').reset();

        // Populate form fields with asset data
        document.getElementById('assetIdInput').value = asset.id || '';
        document.getElementById('assetName').value = asset.name || '';
        document.getElementById('assetUsername').value = asset.username || '';
        document.getElementById('assetNickname').value = asset.nickname || '';
        document.getElementById('assetType').value = asset.type || '';
        document.getElementById('serialNumber').value = asset.serial || '';
        document.getElementById('assetDepartment').value = asset.department || '';
        document.getElementById('purchaseDate').value = asset.purchaseDate || '';
        document.getElementById('assetStatus').value = asset.status || '';
        document.getElementById('lastCheck').value = asset.lastCheck || '';
        document.getElementById('specs').value = asset.specs || '';
        document.getElementById('notes').value = asset.notes || '';

        // Set field editability based on user role
        this.setFormEditable(this.currentUser.isIT);
    },

    saveAsset() {
        if (!this.currentUser) { this.showToast("กรุณาเข้าสู่ระบบ", "error"); return; }
        const assetId = document.getElementById('assetIdInput').value.trim();
        if (!assetId) { this.showToast("ไม่สามารถบันทึกได้เนื่องจากไม่มีรหัสทรัพย์สิน", "error"); return; }

        const isEditing = this.assets.some(a => a.id === assetId);
        let dataToSave = {};

        // Fields editable by anyone
        dataToSave.username = document.getElementById('assetUsername').value.trim();
        dataToSave.nickname = document.getElementById('assetNickname').value.trim();
        
        // Fields editable only by IT
        if (this.currentUser.isIT) {
            dataToSave.name = document.getElementById('assetName').value.trim();
            dataToSave.type = document.getElementById('assetType').value;
            dataToSave.serial = document.getElementById('serialNumber').value.trim();
            dataToSave.department = document.getElementById('assetDepartment').value;
            dataToSave.specs = document.getElementById('specs').value.trim();
            dataToSave.purchaseDate = document.getElementById('purchaseDate').value;
            dataToSave.status = document.getElementById('assetStatus').value;
            dataToSave.lastCheck = document.getElementById('lastCheck').value;
            dataToSave.notes = document.getElementById('notes').value.trim();
            
            // Basic validation for required fields
            if (!dataToSave.name || !dataToSave.type || !dataToSave.department || !dataToSave.status) {
                this.showToast("กรุณากรอกข้อมูลที่จำเป็น (ชื่อ, ประเภท, แผนก, สถานะ)", "error");
                return;
            }
        } else if (isEditing) {
            // Non-IT users can only update username and nickname on existing assets
            const existingAsset = this.assets.find(a => a.id === assetId);
            dataToSave = { ...existingAsset, ...dataToSave };
            delete dataToSave.id; // Don't save the ID as a field within the object
        } else {
            this.showToast("คุณไม่มีสิทธิ์เพิ่มทรัพย์สิน", "error");
            return;
        }

        this.showLoader();
        set(ref(this.db, 'assets/' + assetId), dataToSave)
            .then(() => {
                this.showToast(`บันทึกข้อมูลสำเร็จ!`, 'success');
                this.showPage('assetListPage');
            })
            .catch((error) => {
                console.error("Save asset failed:", error);
                this.showToast("เกิดข้อผิดพลาดในการบันทึก", "error");
            })
            .finally(() => {
                this.hideLoader();
            });
    },

    deleteAsset(assetId) {
        if (!this.currentUser.isIT) { this.showToast("คุณไม่มีสิทธิ์ลบข้อมูล", "error"); return; }
        
        this.showConfirmModal('ยืนยันการลบ', `ต้องการลบทรัพย์สิน "${assetId}"? การกระทำนี้ไม่สามารถย้อนกลับได้`, () => {
            this.showLoader();
            remove(ref(this.db, `assets/${assetId}`))
                .then(() => this.showToast('ลบข้อมูลสำเร็จ', 'success'))
                .catch(error => {
                    console.error("Delete asset failed:", error);
                    this.showToast('เกิดข้อผิดพลาดในการลบ', 'error');
                })
                .finally(() => this.hideLoader());
        });
    },

    generateAssetId() {
        // Only generate ID when adding a new asset (form title must match)
        if (!this.currentUser.isIT || document.getElementById('formTitle').textContent !== 'เพิ่มทรัพย์สินใหม่') return;
        
        const type = document.getElementById('assetType').value;
        if (!type) return;

        // Find the highest number for the selected type
        const assetsOfType = this.assets.filter(a => a.id && a.id.startsWith(type + "-"));
        let maxNum = 0;
        if (assetsOfType.length > 0) {
            maxNum = Math.max(...assetsOfType.map(a => {
                const numPart = parseInt(a.id.split('-')[1] || 0, 10);
                return isNaN(numPart) ? 0 : numPart;
            }));
        }
        // Create new ID with padded number
        const newId = `${type}-${(maxNum + 1).toString().padStart(3, '0')}`;
        document.getElementById('assetIdInput').value = newId;
    },

    setFormEditable(isIT) {
        // Fields only IT can edit
        const itOnlyFields = ['assetName', 'assetType', 'serialNumber', 'assetDepartment', 'specs', 'purchaseDate', 'assetStatus', 'lastCheck', 'notes'];
        
        // Fields anyone can edit
        ['assetUsername', 'assetNickname'].forEach(id => {
             const el = document.getElementById(id);
             el.readOnly = false;
             el.classList.remove('bg-gray-100');
        });

        itOnlyFields.forEach(id => {
            const el = document.getElementById(id);
            if (el.tagName === 'SELECT') {
                el.disabled = !isIT;
            } else {
                el.readOnly = !isIT;
            }
            el.classList.toggle('bg-gray-100', !isIT);
        });
    },

    // --- DEPARTMENT CRUD ---
    renderDepartmentList() {
        const container = document.getElementById('departmentListContainer');
        container.innerHTML = '';
        if (this.departments.length === 0) {
            container.innerHTML = `<p class="p-6 text-center text-gray-500">ยังไม่มีแผนก</p>`;
            return;
        }
        this.departments.sort().forEach(depName => {
            const div = document.createElement('div');
            div.className = 'p-4 flex justify-between items-center';
            div.innerHTML = `
                <span>${depName}</span>
                <div class="space-x-4">
                    <button onclick="App.editDepartment('${depName}')" class="text-blue-500 hover:text-blue-700" title="แก้ไข"><i class="fas fa-edit"></i></button>
                    <button onclick="App.deleteDepartment('${depName}')" class="text-red-500 hover:text-red-700" title="ลบ"><i class="fas fa-trash"></i></button>
                </div>`;
            container.appendChild(div);
        });
    },

    addDepartment() {
        const input = document.getElementById('newDepartmentName');
        const newName = input.value.trim();
        if (!newName) { this.showToast('กรุณาใส่ชื่อแผนก', 'error'); return; }
        if (this.departments.find(d => d.toLowerCase() === newName.toLowerCase())) {
            this.showToast('มีแผนกนี้อยู่แล้ว', 'error');
            return;
        }
        set(ref(this.db, `departments/${newName}`), true)
            .then(() => { this.showToast('เพิ่มแผนกสำเร็จ', 'success'); input.value = ''; })
            .catch(error => {
                console.error("Add department failed:", error);
                this.showToast('เกิดข้อผิดพลาดในการเพิ่มแผนก', 'error');
            });
    },

    editDepartment(oldName) {
        const newName = prompt(`แก้ไขชื่อแผนก "${oldName}":`, oldName);
        if (!newName || newName.trim() === '' || newName.trim() === oldName) return; // User cancelled or no change
        if (this.departments.find(d => d.toLowerCase() === newName.trim().toLowerCase())) {
            this.showToast('มีแผนกชื่อนี้อยู่แล้ว', 'error');
            return;
        }
        this.showLoader();
        const updates = {};
        // Find all assets in the old department and update them
        this.assets.forEach(asset => {
            if (asset.department === oldName) {
                updates[`/assets/${asset.id}/department`] = newName.trim();
            }
        });
        // Remove old department and add new one
        updates[`/departments/${oldName}`] = null;
        updates[`/departments/${newName.trim()}`] = true;

        update(ref(this.db), updates)
            .then(() => this.showToast('แก้ไขแผนกสำเร็จ', 'success'))
            .catch(error => {
                console.error("Edit department failed:", error);
                this.showToast('เกิดข้อผิดพลาดในการแก้ไข', 'error');
            })
            .finally(() => this.hideLoader());
    },

    deleteDepartment(depName) {
        // Prevent deletion if assets are still assigned to the department
        if (this.assets.some(asset => asset.department === depName)) {
            this.showToast('ไม่สามารถลบได้ เนื่องจากยังมีทรัพย์สินอยู่ในแผนกนี้', 'error');
            return;
        }
        this.showConfirmModal('ยืนยันการลบ', `ต้องการลบแผนก "${depName}"?`, () => {
            remove(ref(this.db, `departments/${depName}`))
                .then(() => this.showToast('ลบแผนกสำเร็จ', 'success'))
                .catch(error => {
                    console.error("Delete department failed:", error);
                    this.showToast('เกิดข้อผิดพลาดในการลบ', 'error');
                });
        });
    },

    // --- UTILITY & MODAL FUNCTIONS ---
    showLoader() { document.getElementById('loader').classList.remove('hidden'); },
    hideLoader() { document.getElementById('loader').classList.add('hidden'); },

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        const iconClass = type === 'success' ? 'fa-check-circle' : (type === 'error' ? 'fa-times-circle' : 'fa-info-circle');
        toast.innerHTML = `<i class="fas ${iconClass} mr-3 text-lg"></i> ${message}`;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    },

    showConfirmModal(title, message, onConfirm) {
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = message;
        const modal = document.getElementById('confirmModal');
        modal.classList.remove('hidden');

        const okBtn = document.getElementById('confirmOkBtn');
        const cancelBtn = document.getElementById('confirmCancelBtn');

        // Use .cloneNode(true) to remove any previous event listeners
        const newOkBtn = okBtn.cloneNode(true);
        okBtn.parentNode.replaceChild(newOkBtn, okBtn);

        const newCancelBtn = cancelBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

        const close = () => modal.classList.add('hidden');
        const handleConfirm = () => { onConfirm(); close(); };

        newOkBtn.addEventListener('click', handleConfirm);
        newCancelBtn.addEventListener('click', close);
    },

    showAssetDetailModal(assetId) {
        const asset = this.assets.find(a => a.id === assetId);
        if (!asset) { this.showToast("ไม่พบข้อมูลทรัพย์สิน", "error"); return; }

        // Populate modal fields
        document.getElementById('detailAssetId').textContent = asset.id || '-';
        document.getElementById('detailAssetName').textContent = asset.name || '-';
        document.getElementById('detailAssetUsername').textContent = asset.username || '-';
        document.getElementById('detailAssetNickname').textContent = asset.nickname || '-';
        document.getElementById('detailAssetType').textContent = this.assetTypes[asset.type] || asset.type || '-';
        document.getElementById('detailSerialNumber').textContent = asset.serial || '-';
        document.getElementById('detailAssetDepartment').textContent = asset.department || '-';
        document.getElementById('detailPurchaseDate').textContent = asset.purchaseDate || '-';
        document.getElementById('detailLastCheck').textContent = asset.lastCheck || '-';
        document.getElementById('detailSpecs').textContent = asset.specs || '-';
        document.getElementById('detailNotes').textContent = asset.notes || '-';
        
        const statusBadge = document.getElementById('detailAssetStatusBadge');
        statusBadge.className = `status-badge status-${asset.status || 'หาไม่เจอ'}`;
        statusBadge.textContent = asset.status || 'N/A';

        // Show the modal
        document.getElementById('assetDetailModal').classList.remove('hidden');
    },

    closeAssetDetailModal() {
        document.getElementById('assetDetailModal').classList.add('hidden');
    },
};

// --- START THE APP ---
// Wait for the DOM to be fully loaded before initializing the app
document.addEventListener('DOMContentLoaded', () => App.init());
// Expose the App object to the global window scope to allow onclick attributes in HTML to work
window.App = App;
=======
// Global variables
let currentUser = null; // Stores { department: string, isIT: boolean }
let assets = [];        // Stores all assets fetched from Firebase
let filteredAssets = [];// Stores assets after filtering, used by assetTable
let currentPage = 1;
const itemsPerPage = 10;

// Chart instances
let departmentPieChart = null;
let statusPieChart = null;


// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    const loginModal = document.getElementById('loginModal');
    if (loginModal) {
        // loginModal.classList.remove('hidden'); // Keep login modal hidden initially if not desired
                                                // ให้แสดง modal login เมื่อเริ่มถ้าต้องการ
    }
    initEventListeners();
});

function initEventListeners() {
    // Event listener for asset search input
    const assetSearch = document.getElementById('assetSearch');
    if (assetSearch) assetSearch.addEventListener('input', filterAssets);

    // Event listener for department filter dropdown
    const departmentFilter = document.getElementById('departmentFilter');
    if (departmentFilter) departmentFilter.addEventListener('change', filterAssets);

    // Event listener for status filter dropdown
    const statusFilter = document.getElementById('statusFilter');
    if (statusFilter) statusFilter.addEventListener('change', filterAssets);

    // Event listener for type filter dropdown
    const typeFilter = document.getElementById('typeFilter');
    if (typeFilter) typeFilter.addEventListener('change', filterAssets);

    // Event listener for previous page button
    const prevPage = document.getElementById('prevPage');
    if (prevPage) prevPage.addEventListener('click', goToPrevPage);

    // Event listener for next page button
    const nextPage = document.getElementById('nextPage');
    if (nextPage) nextPage.addEventListener('click', goToNextPage);

    // Event listener for asset form submission
    const assetForm = document.getElementById('assetForm');
    if (assetForm) assetForm.addEventListener('submit', saveAsset);

    // Event listener for import button
    const importBtn = document.getElementById('importBtn');
    if (importBtn) importBtn.addEventListener('click', openImportModal);

    // Event listener for Enter key in department select (login form)
    const departmentSelect = document.getElementById('department');
    if (departmentSelect) {
        departmentSelect.addEventListener('keydown', function(event) {
            if (event.key === 'Enter' || event.keyCode === 13) {
                event.preventDefault(); // Prevent default form submission or other actions
                const passwordField = document.getElementById('password');
                if (passwordField) {
                    passwordField.focus(); // Move focus to password field
                }
            }
        });
    }

    // Event listener for Enter key in password input (login form)
    const passwordInput = document.getElementById('password');
    if (passwordInput) {
        passwordInput.addEventListener('keydown', function(event) {
            if (event.key === 'Enter' || event.keyCode === 13) {
                event.preventDefault(); // Prevent default form submission
                login(); // Attempt login
            }
        });
    }
}

// Function to handle user login
function login() {
    const departmentEl = document.getElementById('department');
    const passwordEl = document.getElementById('password');
    if (!departmentEl || !passwordEl) {
        console.error('Department or Password element not found.');
        return;
    }

    const department = departmentEl.value;
    const password = passwordEl.value;

    if ((department === 'IT' && password === 'admin123') || (department !== 'IT' && password === '123456')) {
        currentUser = { department: department, isIT: department === 'IT' };
        const loginModal = document.getElementById('loginModal');
        if (loginModal) loginModal.classList.add('hidden'); 

        updateUIForUser(); 
        showDashboard();   
        loadAssets();      
    } else {
        alert('Invalid credentials. Please try again.'); 
    }
}

function closeLoginModal() {
    const loginModal = document.getElementById('loginModal');
    if (loginModal) loginModal.classList.add('hidden');
}

function logout() {
    currentUser = null; 
    assets = [];        
    filteredAssets = [];
    currentPage = 1;    

    const loginModal = document.getElementById('loginModal');
    if (loginModal) loginModal.classList.remove('hidden'); 

    hideAllPages(); 

    const userDepartmentEl = document.getElementById('userDepartment');
    if (userDepartmentEl) userDepartmentEl.textContent = '';

    const assetTableEl = document.getElementById('assetTable');
    if (assetTableEl) assetTableEl.innerHTML = '';
    const recentAssetsTableEl = document.getElementById('recentAssetsTable');
    if (recentAssetsTableEl) recentAssetsTableEl.innerHTML = '';

    const assetSearchEl = document.getElementById('assetSearch');
    if (assetSearchEl) assetSearchEl.value = '';
    const departmentFilterEl = document.getElementById('departmentFilter');
    if (departmentFilterEl) {
        departmentFilterEl.value = 'all'; 
        departmentFilterEl.disabled = false; 
    }
    const statusFilterEl = document.getElementById('statusFilter');
    if (statusFilterEl) statusFilterEl.value = 'all'; 
    const typeFilterEl = document.getElementById('typeFilter');
    if (typeFilterEl) typeFilterEl.value = 'all';   

    if (departmentPieChart) {
        departmentPieChart.destroy();
        departmentPieChart = null;
    }
    if (statusPieChart) {
        statusPieChart.destroy();
        statusPieChart = null;
    }

    updateDashboard(); 
}

function updateUIForUser() {
    if (!currentUser) return; 

    const userDepartmentEl = document.getElementById('userDepartment');
    if (userDepartmentEl) userDepartmentEl.textContent = currentUser.department;

    const isIT = currentUser.isIT; 

    const addAssetMenuEl = document.getElementById('addAssetMenu');
    if (addAssetMenuEl) addAssetMenuEl.classList.toggle('hidden', !isIT); 
    const addAssetBtnEl = document.getElementById('addAssetBtn');
    if (addAssetBtnEl) addAssetBtnEl.classList.toggle('hidden', !isIT);   
    const importBtnEl = document.getElementById('importBtn');
    if (importBtnEl) importBtnEl.classList.toggle('hidden', !isIT);     

    const departmentFilterEl = document.getElementById('departmentFilter');
    if (departmentFilterEl) {
        if (!isIT) {
            departmentFilterEl.value = currentUser.department; 
            departmentFilterEl.disabled = true;                
        } else {
            departmentFilterEl.disabled = false;               
        }
    }
}

function toggleSidebar() {
    const sidebarEl = document.getElementById('sidebar');
    const mainContentEl = document.getElementById('mainContent');

    if (sidebarEl) sidebarEl.classList.toggle('collapsed');     
    if (mainContentEl) mainContentEl.classList.toggle('expanded'); 
}

function hideAllPages() {
    ['dashboardPage', 'assetListPage', 'assetFormPage'].forEach(id => {
        const page = document.getElementById(id);
        if (page) page.classList.add('hidden'); 
    });
}

function showDashboard() {
    hideAllPages(); 
    const dashboardPageEl = document.getElementById('dashboardPage');
    if (dashboardPageEl) dashboardPageEl.classList.remove('hidden'); 
    updateDashboard(); 
}

function showAssetList() {
    hideAllPages(); 
    const assetListPageEl = document.getElementById('assetListPage');
    if (assetListPageEl) assetListPageEl.classList.remove('hidden'); 
    filterAssets(); 
}

function showAddAsset() {
    // Permission Check: Only IT users can add assets.
    if (!currentUser || !currentUser.isIT) { 
        alert("You don't have permission to add assets.");
        return;
    }
    hideAllPages(); // Hide other pages
    const assetFormPageEl = document.getElementById('assetFormPage');
    if (assetFormPageEl) assetFormPageEl.classList.remove('hidden'); // Show form page

    // Set form title for "Add" mode
    const formTitleEl = document.getElementById('formTitle');
    if (formTitleEl) formTitleEl.textContent = 'Add New Asset';

    // Reset the form fields
    const assetFormEl = document.getElementById('assetForm');
    if (assetFormEl) assetFormEl.reset();

    // Ensure all fields are editable when adding a new asset
    const fieldsToEnable = ['assetName', 'assetUsername', 'assetNickname', 'assetType', 'serialNumber', 'assetDepartment', 'specs', 'purchaseDate', 'assetStatus', 'lastCheck', 'notes', 'assetId'];
    fieldsToEnable.forEach(fieldId => {
        const el = document.getElementById(fieldId);
        if (el) {
            if (el.tagName === 'SELECT') {
                el.disabled = false; // Enable select dropdowns
            } else {
                el.readOnly = false; // Make input/textarea fields editable
            }
            el.classList.remove('bg-gray-100', 'cursor-not-allowed'); // Remove disabled styling
        }
    });

    // Specifically log the status of the assetType dropdown for debugging
    const assetTypeDropdown = document.getElementById('assetType');
    if (assetTypeDropdown) {
        console.log('In showAddAsset(): assetType dropdown disabled status =', assetTypeDropdown.disabled);
    } else {
        console.error('In showAddAsset(): assetType dropdown not found!');
    }
    

    // Clear and enable Asset ID field for new asset (IT can set it initially)
    const assetIdEl = document.getElementById('assetId');
    if (assetIdEl) {
        assetIdEl.value = '';
        assetIdEl.readOnly = false; 
        assetIdEl.classList.remove('bg-gray-100', 'cursor-not-allowed');
    }

    // Setup listener for Asset Type change to auto-generate Asset ID
    const assetTypeElement = document.getElementById('assetType');
    if (assetTypeElement) {
        assetTypeElement.removeEventListener('change', generateAssetId); // Remove any existing listener
        assetTypeElement.addEventListener('change', generateAssetId);   // Add listener
    }
    generateAssetId(); // Generate an initial Asset ID based on the default selected type
}

function showEditAsset(assetIdToEdit) {
    if (!currentUser) { 
        alert("Please login to edit assets.");
        return;
    }

    hideAllPages(); 
    const assetFormPageEl = document.getElementById('assetFormPage');
    if (assetFormPageEl) assetFormPageEl.classList.remove('hidden'); 

    const formTitleEl = document.getElementById('formTitle');
    if (formTitleEl) formTitleEl.textContent = 'Edit Asset';

    const asset = assets.find(a => a.id === assetIdToEdit);
    if (!asset) {
        alert("Asset not found for editing.");
        showAssetList(); 
        return;
    }

    const assetIdEl = document.getElementById('assetId');
    if (assetIdEl) {
        assetIdEl.value = asset.id;
        assetIdEl.readOnly = true; 
        assetIdEl.classList.add('bg-gray-100', 'cursor-not-allowed'); 
    }

    const configureField = (elementId, assetValue, isAlwaysEditable = false) => {
        const el = document.getElementById(elementId);
        if (!el) return; 

        el.value = assetValue || (el.tagName === 'SELECT' && el.options.length > 0 ? el.options[0].value : '');

        const isITUser = currentUser.isIT;
        const isDisabledOrReadonly = !isITUser && !isAlwaysEditable; 

        if (el.tagName === 'SELECT') {
            el.disabled = isDisabledOrReadonly;
        } else { 
            el.readOnly = isDisabledOrReadonly;
        }

        if (isDisabledOrReadonly) {
            el.classList.add('bg-gray-100', 'cursor-not-allowed');
            if (el.tagName !== 'SELECT') el.tabIndex = -1; 
        } else {
            el.classList.remove('bg-gray-100', 'cursor-not-allowed');
            if (el.tagName !== 'SELECT') el.tabIndex = 0; 
        }
    };

    configureField('assetUsername', asset.username, true); 
    configureField('assetNickname', asset.nickname, true); 

    configureField('assetName', asset.name);
    configureField('assetType', asset.type || 'OT'); 
    configureField('serialNumber', asset.serial);
    configureField('assetDepartment', asset.department);
    configureField('specs', asset.specs);
    configureField('purchaseDate', asset.purchaseDate);
    configureField('assetStatus', asset.status || ''); 
    configureField('lastCheck', asset.lastCheck);
    configureField('notes', asset.notes);

    const assetTypeElement = document.getElementById('assetType');
    if (assetTypeElement) {
        assetTypeElement.removeEventListener('change', generateAssetId);
    }
}


function generateAssetId() {
    if (!currentUser || !currentUser.isIT) return; 

    const formTitleEl = document.getElementById('formTitle');
    if (formTitleEl && formTitleEl.textContent === 'Edit Asset') return;

    const assetTypeEl = document.getElementById('assetType');
    const assetIdInputEl = document.getElementById('assetId');

    if (!assetTypeEl || !assetIdInputEl) return; 
    const type = assetTypeEl.value;
    if (!type) return; 

    const assetsOfType = assets.filter(a => a.id && typeof a.id === 'string' && a.id.startsWith(type + "-"));
    let nextNumber = 1;
    if (assetsOfType.length > 0) {
        const maxNum = assetsOfType.reduce((max, asset) => {
            const parts = asset.id.split('-'); 
            if (parts.length > 1) {
                const numPart = parseInt(parts[1]);
                if (!isNaN(numPart) && numPart > max) {
                    return numPart;
                }
            }
            return max;
        }, 0);
        nextNumber = maxNum + 1; 
    }
    const newId = `${type}-${nextNumber.toString().padStart(3, '0')}`;
    assetIdInputEl.value = newId; 
}

function loadAssets() {
    if (!window.firebase || !window.firebase.database) { 
        console.error("Firebase database is not initialized!");
        alert("เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล Firebase");
        return;
    }

    const db = window.firebase.database;
    const assetsRef = window.firebase.ref(db, 'assets/'); 

    window.firebase.onValue(assetsRef, (snapshot) => {
        const data = snapshot.val(); 
        assets = []; 
        if (data) {
            assets = Object.keys(data).map(key => ({
                id: key,    
                ...data[key] 
            }));
        }

        const dashboardPageEl = document.getElementById('dashboardPage');
        const assetListPageEl = document.getElementById('assetListPage');

        if (dashboardPageEl && !dashboardPageEl.classList.contains('hidden')) {
            updateDashboard(); 
        } else if (assetListPageEl && !assetListPageEl.classList.contains('hidden')) {
            filterAssets();    
        }

    }, (error) => { 
        console.error("Firebase data loading error:", error);
        alert("ไม่สามารถโหลดข้อมูลทรัพย์สินจาก Firebase ได้: " + error.message);
        assets = []; 
        const dashboardPageEl = document.getElementById('dashboardPage');
        const assetListPageEl = document.getElementById('assetListPage');
        if (dashboardPageEl && !dashboardPageEl.classList.contains('hidden')) {
            updateDashboard();
        } else if (assetListPageEl && !assetListPageEl.classList.contains('hidden')) {
            filterAssets();
        }
    });
}

function filterAssets() {
    if (!currentUser) return; 

    const assetSearchEl = document.getElementById('assetSearch');
    const departmentFilterEl = document.getElementById('departmentFilter');
    const statusFilterEl = document.getElementById('statusFilter');
    const typeFilterEl = document.getElementById('typeFilter');

    const searchTerm = assetSearchEl ? assetSearchEl.value.toLowerCase() : '';
    const departmentFilterValue = (!currentUser.isIT && currentUser.department)
                                  ? currentUser.department
                                  : (departmentFilterEl ? departmentFilterEl.value : 'all');

    const statusFilterValue = statusFilterEl ? statusFilterEl.value : 'all';
    const typeFilterValue = typeFilterEl ? typeFilterEl.value : 'all';

    filteredAssets = assets.filter(asset => {
        const matchesSearch = searchTerm === '' ||
            (asset.id && typeof asset.id === 'string' && asset.id.toLowerCase().includes(searchTerm)) ||
            (asset.name && typeof asset.name === 'string' && asset.name.toLowerCase().includes(searchTerm)) ||
            (asset.username && typeof asset.username === 'string' && asset.username.toLowerCase().includes(searchTerm)) ||
            (asset.nickname && typeof asset.nickname === 'string' && asset.nickname.toLowerCase().includes(searchTerm)) ||
            (asset.serial && typeof asset.serial === 'string' && asset.serial.toLowerCase().includes(searchTerm));

        const matchesDepartment = departmentFilterValue === 'all' || (asset.department && asset.department === departmentFilterValue);
        const matchesStatus = statusFilterValue === 'all' || (asset.status && asset.status === statusFilterValue);
        const matchesType = typeFilterValue === 'all' || (asset.type && asset.type === typeFilterValue);

        return matchesSearch && matchesDepartment && matchesStatus && matchesType; 
    });

    currentPage = 1; 
    renderAssetTable(); 
}

function sanitizeForClassName(name) {
    if (!name || typeof name !== 'string') return 'Unknown'; 
    return name
        .replace(/\s+/g, '') 
        .replace(/[^\u0E00-\u0E7F\w-]/g, ''); 
}

function renderAssetTable() {
    const tableBody = document.getElementById('assetTable');
    if (!tableBody) return; 
    tableBody.innerHTML = ''; 

    if (!filteredAssets) { 
        console.warn("renderAssetTable called with null or undefined filteredAssets.");
        filteredAssets = [];
    }

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, filteredAssets.length);
    const paginatedAssets = filteredAssets.slice(startIndex, endIndex); 

    const startItemEl = document.getElementById('startItem');
    const endItemEl = document.getElementById('endItem');
    const totalItemsEl = document.getElementById('totalItems');
    if (startItemEl) startItemEl.textContent = filteredAssets.length > 0 ? startIndex + 1 : 0;
    if (endItemEl) endItemEl.textContent = endIndex;
    if (totalItemsEl) totalItemsEl.textContent = filteredAssets.length;

    const prevPageEl = document.getElementById('prevPage');
    const nextPageEl = document.getElementById('nextPage');
    if (prevPageEl) prevPageEl.disabled = currentPage === 1; 
    if (nextPageEl) nextPageEl.disabled = endIndex >= filteredAssets.length; 

    paginatedAssets.forEach(asset => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50'; 

        let statusClass = 'status-หาไม่เจอ'; 
        if (asset.status === 'ปกติ') statusClass = 'status-ปกติ';
        else if (asset.status === 'สำรอง') statusClass = 'status-สำรอง';
        else if (asset.status === 'เสีย') statusClass = 'status-เสีย';

        const typeCode = asset.type || 'OT'; 
        const typeClass = `type-${typeCode}`;

        const departmentName = asset.department || 'Unknown'; 
        const departmentClassName = `department-${sanitizeForClassName(departmentName)}`; 

        const itOnlyActionsVisibleClass = currentUser && currentUser.isIT ? '' : 'hidden';

        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${asset.id || '-'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${asset.name || '-'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${asset.username || '-'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${asset.nickname || '-'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">
                <span class="type-badge ${typeClass}">${getTypeName(typeCode)}</span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${asset.serial || '-'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">
                <span class="department-badge ${departmentClassName}">${departmentName}</span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">
                <span class="status-badge ${statusClass}">${asset.status || 'N/A'}</span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                <button onclick="showEditAsset('${asset.id}')" class="text-blue-600 hover:text-blue-900 mr-2" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="deleteAsset('${asset.id}')" class="text-red-600 hover:text-red-900 ${itOnlyActionsVisibleClass} mr-2" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
                <button onclick="viewAssetDetails('${asset.id}')" class="text-green-600 hover:text-green-900" title="View Details">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        `;
        tableBody.appendChild(row); 
    });
}

function getTypeName(typeCode) {
    const types = {
        'PC': 'Computer', 'NB': 'Notebook', 'KB': 'Keyboard',
        'MU': 'Mouse', 'MT': 'Monitor',
        'PH': 'Phone', 'PT': 'Printer', 'OT': 'Other', 
        'AF': 'Air filter', 'CAM': 'Camera', 'EP': 'Ear phone',
        'LT': 'Light', 'MIC': 'Mike'
    };
    return types[typeCode] || typeCode || 'Unknown'; 
}

function goToPrevPage() {
    if (currentPage > 1) { 
        currentPage--;
        renderAssetTable(); 
    }
}

function goToNextPage() {
    if ((currentPage * itemsPerPage) < filteredAssets.length) {
        currentPage++;
        renderAssetTable(); 
    }
}

function saveAsset(e) {
    e.preventDefault(); 
    if (!currentUser) {
        alert("Please login to save assets.");
        return;
    }

    const assetIdValue = document.getElementById('assetId').value.trim();
    if (!assetIdValue) { 
        alert("Asset ID is required. Cannot save.");
        return;
    }

    const isEditing = assets.some(a => a.id === assetIdValue);
    let dataToSave = {}; 

    if (document.getElementById('assetUsername')) dataToSave.username = document.getElementById('assetUsername').value.trim();
    if (document.getElementById('assetNickname')) dataToSave.nickname = document.getElementById('assetNickname').value.trim();

    if (currentUser.isIT) {
        dataToSave.name = document.getElementById('assetName').value.trim();
        dataToSave.type = document.getElementById('assetType').value;
        dataToSave.serial = document.getElementById('serialNumber').value.trim();
        dataToSave.department = document.getElementById('assetDepartment').value;
        dataToSave.specs = document.getElementById('specs').value; 
        dataToSave.purchaseDate = document.getElementById('purchaseDate').value;
        dataToSave.status = document.getElementById('assetStatus').value;
        dataToSave.lastCheck = document.getElementById('lastCheck').value;
        dataToSave.notes = document.getElementById('notes').value; 

        if (!dataToSave.name) { alert("Asset Name is required."); return; }
        if (!dataToSave.type) { alert("Asset Type is required."); return; }
        if (!dataToSave.department) { alert("Department is required."); return; }
        if (!dataToSave.status) { alert("Status is required."); return; }

    } else if (isEditing) {
        const existingAsset = assets.find(a => a.id === assetIdValue);
        if (existingAsset) {
            dataToSave = {
                ...existingAsset, 
                username: dataToSave.username, 
                nickname: dataToSave.nickname  
            };
            delete dataToSave.id; 
        } else {
            alert("Original asset data not found for update. Cannot save.");
            return;
        }
    } else {
        alert("You do not have permission to add new assets.");
        return;
    }

    const db = window.firebase.database;
    const assetRef = window.firebase.ref(db, 'assets/' + assetIdValue); 

    window.firebase.set(assetRef, dataToSave)
        .then(() => {
            alert(`Asset ${isEditing ? 'updated' : 'added'} successfully!`);
            showAssetList(); 
        })
        .catch((error) => {
            console.error("Error saving asset to Firebase:", error);
            alert("Failed to save asset: " + error.message);
        });
}

function deleteAsset(assetIdToDelete) {
    if (!currentUser || !currentUser.isIT) { 
        alert("You don't have permission to delete assets.");
        return;
    }
    if (confirm(`Are you sure you want to delete asset ${assetIdToDelete}? This action cannot be undone.`)) {
        const db = window.firebase.database;
        const assetRef = window.firebase.ref(db, 'assets/' + assetIdToDelete); 

        window.firebase.remove(assetRef)
            .then(() => {
                alert('Asset deleted successfully from Firebase!');
            })
            .catch((error) => {
                console.error("Error deleting asset from Firebase:", error);
                alert("Failed to delete asset: " + error.message);
            });
    }
}

function viewAssetDetails(assetIdToView) {
    const asset = assets.find(a => a.id === assetIdToView); 
    if (asset) {
        let statusClass = 'status-หาไม่เจอ'; 
        if (asset.status === 'ปกติ') statusClass = 'status-ปกติ';
        else if (asset.status === 'สำรอง') statusClass = 'status-สำรอง';
        else if (asset.status === 'เสีย') statusClass = 'status-เสีย';

        const detailsHtml = `
            <div class="bg-white p-6 rounded-lg shadow-xl border border-gray-200 max-w-lg mx-auto">
                <div class="flex justify-between items-center mb-4 pb-2 border-b">
                    <h2 class="text-xl font-bold text-gray-800">${asset.id || '-'} : ${asset.name || '-'}</h2>
                    <span class="status-badge ${statusClass}">${asset.status || 'N/A'}</span>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 mb-4 text-sm">
                    <div><strong class="text-gray-600">Username:</strong> ${asset.username || '-'}</div>
                    <div><strong class="text-gray-600">ชื่อเล่น:</strong> ${asset.nickname || '-'}</div>
                    <div><strong class="text-gray-600">Type:</strong> ${getTypeName(asset.type)}</div>
                    <div><strong class="text-gray-600">Serial:</strong> ${asset.serial || '-'}</div>
                    <div><strong class="text-gray-600">Department:</strong> ${asset.department || '-'}</div>
                    <div><strong class="text-gray-600">Purchase Date:</strong> ${asset.purchaseDate || '-'}</div>
                    <div><strong class="text-gray-600">Last Check:</strong> ${asset.lastCheck || '-'}</div>
                </div>
                <div class="mb-4">
                    <h3 class="text-md font-semibold text-gray-700 mb-1">Specifications:</h3>
                    <p class="whitespace-pre-wrap text-sm text-gray-600 bg-gray-50 p-2 rounded-md">${asset.specs || '-'}</p>
                </div>
                <div>
                    <h3 class="text-md font-semibold text-gray-700 mb-1">Notes:</h3>
                    <p class="whitespace-pre-wrap text-sm text-gray-600 bg-gray-50 p-2 rounded-md">${asset.notes || '-'}</p>
                </div>
                <div class="flex justify-end mt-6">
                    <button onclick="closeModal('assetDetailsModal')" class="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                        Close
                    </button>
                </div>
            </div>`;

        const modalContainer = document.createElement('div');
        modalContainer.className = 'fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 fade-in p-4 overflow-y-auto';
        modalContainer.id = 'assetDetailsModal';
        modalContainer.innerHTML = detailsHtml;
        document.body.appendChild(modalContainer);
    } else {
        alert("Asset details not found."); 
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.remove(); 
}

function updateDashboard() {
    const setElementText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
        else console.warn(`Element with ID '${id}' not found in updateDashboard.`);
    };

    const recentAssetsTableEl = document.getElementById('recentAssetsTable');
    const departmentChartCanvas = document.getElementById('departmentChart');
    const statusChartCanvas = document.getElementById('statusChart');


    if (!currentUser) { 
        setElementText('totalAssets', '0');
        setElementText('activeAssets', '0');
        setElementText('brokenAssets', '0');
        setElementText('reserveAssets', '0');
        setElementText('disappearAssets', '0');
        if (recentAssetsTableEl) recentAssetsTableEl.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-gray-500">Please log in to see data.</td></tr>';
        
        if (departmentPieChart) departmentPieChart.destroy();
        departmentPieChart = null;
        if (departmentChartCanvas && departmentChartCanvas.parentElement) { // Check parentElement
            const ctx = departmentChartCanvas.getContext('2d');
            ctx.clearRect(0, 0, departmentChartCanvas.width, departmentChartCanvas.height);
             // Ensure canvas is recreated if removed
            if (!document.getElementById('departmentChart')) {
                departmentChartCanvas.parentElement.innerHTML = '<canvas id="departmentChart"></canvas>';
            }
            const p = departmentChartCanvas.parentElement.querySelector('p.placeholder-text');
            if (!p) {
                 departmentChartCanvas.insertAdjacentHTML('afterend', '<p class="text-center text-gray-500 mt-4 placeholder-text">Log in for department data</p>');
            } else {
                p.style.display = 'block';
            }
        }


        if (statusPieChart) statusPieChart.destroy();
        statusPieChart = null;
        if (statusChartCanvas && statusChartCanvas.parentElement) { // Check parentElement
             const ctx = statusChartCanvas.getContext('2d');
            ctx.clearRect(0, 0, statusChartCanvas.width, statusChartCanvas.height);
            if (!document.getElementById('statusChart')) {
                statusChartCanvas.parentElement.innerHTML = '<canvas id="statusChart"></canvas>';
            }
            const p = statusChartCanvas.parentElement.querySelector('p.placeholder-text');
            if(!p) {
                statusChartCanvas.insertAdjacentHTML('afterend', '<p class="text-center text-gray-500 mt-4 placeholder-text">Log in for status data</p>');
            } else {
                p.style.display = 'block';
            }
        }
        return;
    }
    
    // Remove placeholders if user is logged in and charts will be drawn
    const departmentChartContainer = document.getElementById('departmentChartContainer');
    const statusChartContainer = document.getElementById('statusChartContainer');
    if (departmentChartContainer) {
        const placeholder = departmentChartContainer.querySelector('p.placeholder-text');
        if (placeholder) placeholder.style.display = 'none';
    }
    if (statusChartContainer) {
        const placeholder = statusChartContainer.querySelector('p.placeholder-text');
        if (placeholder) placeholder.style.display = 'none';
    }


    let assetsForDashboard = currentUser.isIT ? [...assets] : assets.filter(a => a.department === currentUser.department);

    setElementText('totalAssets', assetsForDashboard.length);
    setElementText('activeAssets', assetsForDashboard.filter(a => a.status === 'ปกติ').length);
    setElementText('brokenAssets', assetsForDashboard.filter(a => a.status === 'เสีย').length);
    setElementText('reserveAssets', assetsForDashboard.filter(a => a.status === 'สำรอง').length);
    setElementText('disappearAssets', assetsForDashboard.filter(a => a.status === 'หาไม่เจอ').length);

    if (recentAssetsTableEl) {
        recentAssetsTableEl.innerHTML = ''; 
        const recentAssets = [...assetsForDashboard]
            .sort((a, b) => { 
                const dateA = a.lastCheck ? new Date(a.lastCheck) : (a.purchaseDate ? new Date(a.purchaseDate) : 0);
                const dateB = b.lastCheck ? new Date(b.lastCheck) : (b.purchaseDate ? new Date(b.purchaseDate) : 0);
                return dateB - dateA;
            })
            .slice(0, 5); 

        if (recentAssets.length === 0) { 
            recentAssetsTableEl.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-gray-500">No recent assets to display.</td></tr>';
        } else {
            recentAssets.forEach(asset => { 
                let statusClass = 'status-หาไม่เจอ'; 
                if (asset.status === 'ปกติ') statusClass = 'status-ปกติ';
                else if (asset.status === 'สำรอง') statusClass = 'status-สำรอง';
                else if (asset.status === 'เสีย') statusClass = 'status-เสีย';

                const typeCode = asset.type || 'OT';
                const departmentName = asset.department || 'Unknown';
                const departmentClassName = `department-${sanitizeForClassName(departmentName)}`;
                const typeClassName = `type-${typeCode}`;

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${asset.id || '-'}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${asset.name || '-'}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${asset.username || '-'}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${asset.nickname || '-'}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm">
                        <span class="type-badge ${typeClassName}">${getTypeName(typeCode)}</span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm">
                        <span class="department-badge ${departmentClassName}">${departmentName}</span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm">
                        <span class="status-badge ${statusClass}">${asset.status || 'N/A'}</span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${asset.lastCheck || asset.purchaseDate || '-'}</td>
                `;
                recentAssetsTableEl.appendChild(row);
            });
        }
    }

    updateDepartmentChart(assetsForDashboard);
    updateStatusChart(assetsForDashboard);
}

function updateDepartmentChart(chartData) {
    const departmentChartCanvas = document.getElementById('departmentChart');
    const container = document.getElementById('departmentChartContainer');
    if (!departmentChartCanvas || !container) return;

    let placeholder = container.querySelector('p.placeholder-text');
    if (chartData && chartData.length > 0) {
        if (placeholder) placeholder.style.display = 'none';
    } else {
        if (departmentPieChart) {
            departmentPieChart.destroy();
            departmentPieChart = null;
        }
        if (!placeholder) {
            departmentChartCanvas.insertAdjacentHTML('afterend', '<p class="text-center text-gray-500 mt-4 placeholder-text">No department data to display.</p>');
        } else {
            placeholder.style.display = 'block';
        }
        const ctx = departmentChartCanvas.getContext('2d');
        ctx.clearRect(0,0, departmentChartCanvas.width, departmentChartCanvas.height); // Clear canvas
        return;
    }


    const counts = chartData.reduce((acc, asset) => {
        const dept = asset.department || 'Unknown'; 
        acc[dept] = (acc[dept] || 0) + 1;
        return acc;
    }, {});

    const labels = Object.keys(counts);
    const data = Object.values(counts);

    const departmentColors = [
        '#4CAF50', '#2196F3', '#FFC107', '#F44336', '#9C27B0',
        '#00BCD4', '#FF9800', '#795548', '#607D8B', '#E91E63',
        '#8BC34A', '#3F51B5', '#FFEB3B', '#03A9F4', '#CDDC39',
        '#673AB7', '#009688', '#FF5722', '#9E9E9E', '#3366CC'
    ];
    const generateColor = (index) => {
        if (index < departmentColors.length) return departmentColors[index];
        let hash = 0;
        const str = labels[index] || `dept${index}`;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        let color = '#';
        for (let i = 0; i < 3; i++) {
            const value = (hash >> (i * 8)) & 0xFF;
            color += ('00' + value.toString(16)).slice(-2);
        }
        return color;
    }

    const backgroundColors = labels.map((label, index) => generateColor(index));

    if (departmentPieChart) {
        departmentPieChart.destroy(); 
    }

    departmentPieChart = new Chart(departmentChartCanvas, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                label: 'Assets by Department',
                data: data,
                backgroundColor: backgroundColors,
                borderColor: backgroundColors.map(color => color.replace(')', ', 0.7)').replace('rgb', 'rgba')), 
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top', 
                    labels: {
                         boxWidth: 20,
                         padding: 15,
                         font: {
                            size: 10 
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed !== null) {
                                label += context.parsed;
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}

function updateStatusChart(chartData) {
    const statusChartCanvas = document.getElementById('statusChart');
    const container = document.getElementById('statusChartContainer');
    if (!statusChartCanvas || !container) return;

    let placeholder = container.querySelector('p.placeholder-text');
    if (chartData && chartData.length > 0) {
        if (placeholder) placeholder.style.display = 'none';
    } else {
        if (statusPieChart) {
            statusPieChart.destroy();
            statusPieChart = null;
        }
        if (!placeholder) {
            statusChartCanvas.insertAdjacentHTML('afterend', '<p class="text-center text-gray-500 mt-4 placeholder-text">No status data to display.</p>');
        } else {
            placeholder.style.display = 'block';
        }
        const ctx = statusChartCanvas.getContext('2d');
        ctx.clearRect(0,0, statusChartCanvas.width, statusChartCanvas.height); // Clear canvas
        return;
    }

    const counts = chartData.reduce((acc, asset) => {
        const stat = asset.status || 'Unknown'; 
        acc[stat] = (acc[stat] || 0) + 1;
        return acc;
    }, {});

    const labels = Object.keys(counts);
    const data = Object.values(counts);

    const statusColors = {
        'ปกติ': '#4CAF50',      
        'สำรอง': '#FFC107',     
        'เสีย': '#F44336',        
        'หาไม่เจอ': '#9E9E9E', 
        'Unknown': '#607D8B'    
    };

    const backgroundColors = labels.map(label => statusColors[label] || statusColors['Unknown']);

    if (statusPieChart) {
        statusPieChart.destroy(); 
    }

    statusPieChart = new Chart(statusChartCanvas, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                label: 'Assets by Status',
                data: data,
                backgroundColor: backgroundColors,
                borderColor: backgroundColors.map(color => color.replace(')', ', 0.7)').replace('rgb', 'rgba')),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                     labels: {
                         boxWidth: 20,
                         padding: 15,
                         font: {
                            size: 10 
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed !== null) {
                                label += context.parsed;
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}


function openImportModal() {
    if (!currentUser || !currentUser.isIT) { 
        alert("You don't have permission to import assets.");
        return;
    }
    const importModalEl = document.getElementById('importModal');
    if (importModalEl) importModalEl.classList.remove('hidden'); 
}

function closeImportModal() {
    const importModalEl = document.getElementById('importModal');
    if (importModalEl) importModalEl.classList.add('hidden'); 
    const importFileEl = document.getElementById('importFile');
    if (importFileEl) importFileEl.value = ''; 
}

function downloadTemplate() {
    const templateData = [
        ["Asset ID", "Asset Name", "Username", "Nickname", "Asset Type", "Serial Number", "Department", "Specifications", "Purchase Date (YYYY-MM-DD)", "Status", "Last Check (YYYY-MM-DD)", "Notes"],
        ["PC-001", "Dell Optiplex 7070", "johndoe", "John", "PC", "ABC123456", "IT", "i7-9700, 16GB RAM, 512GB SSD", "2022-01-15", "ปกติ", "2023-06-10", "Primary workstation"],
        ["NB-002", "MacBook Pro 16\"", "janedoe", "Jane", "NB", "XYZ987654", "Graphic", "M1 Pro, 32GB RAM, 1TB SSD", "2022-03-20", "เสีย", "2023-06-05", "For design team, screen damaged"],
        ["", "", "", "", "", "", "", "", "", "", "", ""], 
        ["คำแนะนำ:", "", "", "", "", "", "", "", "", "", "", ""],
        ["- Asset ID (จำเป็น): ควรเป็นรูปแบบ Type-Number เช่น PC-001, NB-002. ห้ามซ้ำกัน หากซ้ำจะทับข้อมูลเดิม", "", "", "", "", "", "", "", "", "", "", ""],
        ["- Asset Type (จำเป็น): PC, NB, KB, MU, MT, PH, PR, OT, AF, CAM, EP, LT, MIC", "", "", "", "", "", "", "", "", "", "", ""],
        ["- Department (จำเป็น): ระบุชื่อแผนกให้ตรงกับที่มีในระบบ", "", "", "", "", "", "", "", "", "", "", ""],
        ["- Status (จำเป็น): ปกติ, สำรอง, เสีย, หาไม่เจอ", "", "", "", "", "", "", "", "", "", "", ""],
        ["- Purchase Date และ Last Check: ควรเป็นรูปแบบ YYYY-MM-DD (เช่น 2023-12-25)", "", "", "", "", "", "", "", "", "", "", ""]
    ];

    const wb = XLSX.utils.book_new(); 
    const ws = XLSX.utils.aoa_to_sheet(templateData); 

    ws['!cols'] = [
        { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, 
        { wch: 18 }, { wch: 20 }, { wch: 30 }, { wch: 22 }, { wch: 12 }, 
        { wch: 22 }, { wch: 30 }  
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Asset Import Template"); 
    XLSX.writeFile(wb, "Asset_Import_Template.xlsx"); 
}

function importAssets() {
    if (!currentUser || !currentUser.isIT) { 
        alert("You don't have permission to import assets.");
        return;
    }
    const fileInput = document.getElementById('importFile');
    if (!fileInput || fileInput.files.length === 0) { 
        alert('Please select an Excel file to import.'); return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader(); 

    reader.onload = function(e) { 
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]]; 
            const jsonData = XLSX.utils.sheet_to_json(worksheet); 

            if (jsonData.length === 0) {
                alert('No data found in the Excel file.'); return;
            }

            const db = window.firebase.database;
            let importedCount = 0;
            let skippedCount = 0;
            const importPromises = []; 
            const requiredFields = ['Asset ID', 'Asset Name', 'Asset Type', 'Department', 'Status'];

            jsonData.forEach((row, index) => { 
                const assetId = row['Asset ID'] ? String(row['Asset ID']).trim() : null;

                let missingFields = [];
                requiredFields.forEach(field => {
                    if (!row[field] || String(row[field]).trim() === "") {
                        missingFields.push(field);
                    }
                });

                if (missingFields.length > 0) { 
                    skippedCount++;
                    console.warn(`Skipping row ${index + 2} due to missing required fields: ${missingFields.join(', ')} (Asset ID: ${assetId || 'N/A'})`, row);
                    return; 
                }

                const formatDate = (excelDate) => {
                    if (!excelDate) return ''; 
                    if (excelDate instanceof Date) { 
                        const year = excelDate.getFullYear();
                        const month = (excelDate.getMonth() + 1).toString().padStart(2, '0'); 
                        const day = excelDate.getDate().toString().padStart(2, '0');
                        return `${year}-${month}-${day}`; 
                    }
                    if (typeof excelDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(excelDate)) {
                        return excelDate;
                    }
                    console.warn(`Date field for Asset ID ${assetId} (Row ${index + 2}) is not a recognizable date object or YYYY-MM-DD string:`, excelDate);
                    return String(excelDate); 
                };

                const assetData = {
                    name: String(row['Asset Name']).trim(),
                    username: row['Username'] ? String(row['Username']).trim() : '',
                    nickname: row['Nickname'] ? String(row['Nickname']).trim() : '',
                    type: String(row['Asset Type']).trim(),
                    serial: row['Serial Number'] ? String(row['Serial Number']).trim() : '',
                    department: String(row['Department']).trim(),
                    specs: row['Specifications'] ? String(row['Specifications']).trim() : '',
                    purchaseDate: formatDate(row['Purchase Date (YYYY-MM-DD)']),
                    status: String(row['Status']).trim(),
                    lastCheck: formatDate(row['Last Check (YYYY-MM-DD)']),
                    notes: row['Notes'] ? String(row['Notes']).trim() : ''
                };

                const assetRef = window.firebase.ref(db, 'assets/' + assetId);
                importPromises.push(
                    window.firebase.set(assetRef, assetData).then(() => {
                        importedCount++; 
                    }).catch(err => { 
                        console.error(`Failed to import asset ${assetId} (Row ${index + 2} in Excel):`, err, assetData);
                        skippedCount++; 
                    })
                );
            });

            Promise.all(importPromises).then(() => {
                let message = `Import process finished.\nSuccessfully imported/updated ${importedCount} assets.`;
                if (skippedCount > 0) {
                    message += `\nSkipped ${skippedCount} assets. Please check the console (F12 -> Console) for details on skipped rows.`;
                }
                alert(message); 
                closeImportModal(); 
            });

        } catch (error) { 
            console.error('Error processing Excel file:', error);
            alert('Error processing Excel file. Please ensure the file is not corrupted and matches the template. Details: ' + error.message);
        }
    };
    reader.onerror = function() { 
        alert('Error reading the selected file.');
    };
    reader.readAsArrayBuffer(file); 
}


// Make functions globally accessible for use in HTML onclick attributes
window.login = login;
window.closeLoginModal = closeLoginModal;
window.logout = logout;
window.toggleSidebar = toggleSidebar;
window.showDashboard = showDashboard;
window.showAssetList = showAssetList;
window.showAddAsset = showAddAsset;
window.showEditAsset = showEditAsset;
window.deleteAsset = deleteAsset;
window.viewAssetDetails = viewAssetDetails;
window.closeModal = closeModal;
window.openImportModal = openImportModal;
window.closeImportModal = closeImportModal;
window.downloadTemplate = downloadTemplate;
window.importAssets = importAssets;
window.goToPrevPage = goToPrevPage;
window.goToNextPage = goToNextPage;
>>>>>>> d4d2a10774d4fb55e31585994ccdaa0952d04314
