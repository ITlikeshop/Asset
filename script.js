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