// ================================================================
// 1. 配置 ——— 请替换为你的 Supabase 项目信息
// ================================================================
const SUPABASE_CONFIG = {
    url: 'https://mqqkvolvljixdztvrrfw.supabase.co', // 替换为你的 Supabase URL
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xcWt2b2x2bGppeGR6dHZycmZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyOTEzODAsImV4cCI6MjEwMDg2NzM4MH0.RBH9KghNTYtnteVDvei7xYz3K2AsU6R7QLVbx9nofcU',                // 替换为你的 Supabase anon key
};

// ================================================================
// 2. 初始化 Supabase 客户端
// ================================================================
const supabaseClient = window.supabase.createClient(
    SUPABASE_CONFIG.url,
    SUPABASE_CONFIG.anonKey
);

// ================================================================
// 3. DOM 引用（全局声明，在 initApp 中赋值）
// ================================================================
let navActions, grid, statsCount, fabAdd;
let authModal, authModalClose, authTabs, tabLogin, tabRegister;
let loginForm, registerForm, loginEmail, loginPassword;
let registerUsername, registerEmail, registerPassword, loginError, registerError;
let addModal, addModalClose, addModalCancel, addForm;
let addTitle, addUrl, addDesc, addCategory, addError;
let toastContainer;
let homeView, profileView, brandLink;
let profileAvatar, profileUsernameDisplay, usernameLimitInfo, avatarLimitInfo;
let editUsernameBtn, usernameEditArea, usernameInput, saveUsernameBtn, cancelUsernameBtn;
let uploadAvatarBtn, avatarFileInput;

// ================================================================
// 4. 工具函数
// ================================================================
function showToast(message, type = 'info') {
    // 直接使用 document.body，不依赖任何全局变量
    let container = document.body;
    
    // 如果 body 还未就绪（极罕见），延迟重试
    if (!container) {
        setTimeout(() => showToast(message, type), 50);
        return;
    }

    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    
    requestAnimationFrame(() => {
        el.classList.add('show');
    });
    
    setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 400);
    }, 3000);
}

function getInitials(email) {
    if (!email) return '?';
    const parts = email.split('@');
    return parts[0].slice(0, 2).toUpperCase() || '?';
}

function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getDomain(url) {
    try {
        const u = new URL(url);
        return u.hostname.replace(/^www\./, '');
    } catch { return url; }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function isToday(date) {
    if (!date) return false;
    const now = new Date();
    const d = new Date(date);
    return d.getFullYear() === now.getFullYear() &&
           d.getMonth() === now.getMonth() &&
           d.getDate() === now.getDate();
}

// ================================================================
// 5. 认证状态管理
// ================================================================
let currentUser = null;

async function loadSession() {
    if (!supabaseClient || !supabaseClient.auth) {
        console.error('Supabase 客户端未正确初始化');
        return;
    }
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) {
        console.warn('获取 session 失败:', error);
        return;
    }
    currentUser = data?.session?.user || null;
    updateUI();
    if (currentUser) {
        await loadWebsites();
        // 预加载个人资料（但不显示）
        if (currentUser) loadProfileData();
    } else {
        await loadWebsites();
    }
}

supabaseClient.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user || null;
    updateUI();
    if (currentUser) {
        loadWebsites();
        loadProfileData();
        showToast('👋 登录成功！', 'success');
    } else {
        if (event === 'SIGNED_OUT') {
            showToast('已退出', 'info');
            // 如果正在个人空间，返回主页
            if (profileView && profileView.style.display !== 'none') {
                showHomeView();
            }
        }
        loadWebsites();
    }
});

// ================================================================
// 6. UI 更新
// ================================================================
function updateUI() {
    if (!navActions) return;
    const isLoggedIn = !!currentUser;

    if (isLoggedIn) {
        const email = currentUser.email || '';
        const initial = getInitials(email);
        navActions.innerHTML = `
            <div class="user-info" id="userAvatarBtn" style="cursor:pointer;">
                <span class="avatar">${initial}</span>
                <span>${email}</span>
            </div>
            <button class="btn btn-outline btn-sm" id="logoutBtn">退出</button>
        `;
        document.getElementById('userAvatarBtn')?.addEventListener('click', () => {
            if (currentUser) showProfileView();
        });
        document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
    } else {
        navActions.innerHTML = `
            <button class="btn btn-outline btn-sm" id="loginBtn">登录</button>
            <button class="btn btn-primary btn-sm" id="registerBtn">注册</button>
        `;
        document.getElementById('loginBtn')?.addEventListener('click', () => openAuthModal('login'));
        document.getElementById('registerBtn')?.addEventListener('click', () => openAuthModal('register'));
    }

    if (fabAdd) fabAdd.classList.toggle('hidden', !isLoggedIn);
}

// ================================================================
// 7. 认证操作
// ================================================================
async function handleLogin(e) {
    e.preventDefault();
    loginError.classList.remove('show');
    const email = loginEmail.value.trim();
    const password = loginPassword.value;
    if (!email || !password) {
        loginError.textContent = '请填写完整信息';
        loginError.classList.add('show');
        return;
    }
    try {
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        closeAuthModal();
        loginForm.reset();
    } catch (err) {
        loginError.textContent = err.message || '登录失败，请检查邮箱和密码';
        loginError.classList.add('show');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    registerError.classList.remove('show');
    const username = registerUsername.value.trim();
    const email = registerEmail.value.trim();
    const password = registerPassword.value;
    if (!username || !email || !password) {
        registerError.textContent = '请填写完整信息';
        registerError.classList.add('show');
        return;
    }
    if (password.length < 6) {
        registerError.textContent = '密码至少 6 位';
        registerError.classList.add('show');
        return;
    }
    try {
        const { data, error } = await supabaseClient.auth.signUp({
            email,
            password,
            options: {
                data: { username },
            },
        });
        if (error) throw error;
        if (data?.user) {
            showToast('🎉 注册成功！已自动登录', 'success');
            closeAuthModal();
            registerForm.reset();
            await loadSession();
        } else {
            showToast('注册成功，请查看邮箱确认', 'info');
            closeAuthModal();
        }
    } catch (err) {
        registerError.textContent = err.message || '注册失败，请稍后重试';
        registerError.classList.add('show');
    }
}

async function handleLogout() {
    try {
        await supabaseClient.auth.signOut();
    } catch (err) {
        showToast('退出失败: ' + err.message, 'error');
    }
}

// ================================================================
// 8. 视图切换（主页/个人空间）
// ================================================================
function showHomeView() {
    if (!homeView || !profileView) return;
    homeView.style.display = 'block';
    profileView.style.display = 'none';
    document.getElementById('mainContent').style.height = 'auto';
}

function showProfileView() {
    if (!currentUser) {
        showToast('请先登录', 'error');
        return;
    }
    if (!homeView || !profileView) return;
    homeView.style.display = 'none';
    profileView.style.display = 'block';
    document.getElementById('mainContent').style.height = '100%';
    loadProfileData();
}

// ================================================================
// 9. 个人资料数据加载与更新
// ================================================================
let profileData = null;

async function loadProfileData() {
    if (!currentUser) return;
    try {
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();

        if (error && error.code !== 'PGRST116') {
            throw error;
        }

        if (!data) {
            const { error: insertError } = await supabaseClient
                .from('profiles')
                .insert([{ id: currentUser.id, username: currentUser.user_metadata?.username || '用户' }]);
            if (insertError) throw insertError;
            return loadProfileData();
        }

        profileData = data;
        renderProfile(data);
    } catch (err) {
        console.error('加载个人资料失败:', err);
        showToast('加载个人资料失败', 'error');
    }
}

function renderProfile(data) {
    if (!profileAvatar) return;
    if (data.avatar_url) {
        profileAvatar.src = data.avatar_url;
    } else {
        profileAvatar.src = '';
    }
    if (profileUsernameDisplay) {
        profileUsernameDisplay.textContent = data.username || '未设置';
    }
    updateLimitInfo(data);
}

function updateLimitInfo(data) {
    if (usernameLimitInfo) {
        const now = new Date();
        const lastUserUpdate = data.username_updated_at ? new Date(data.username_updated_at) : null;
        const userCount = data.username_update_count || 0;
        const isTodayUser = lastUserUpdate ? isToday(lastUserUpdate) : false;
        const userRemain = isTodayUser ? Math.max(0, 2 - userCount) : 2;
        usernameLimitInfo.textContent = `今日剩余修改次数: ${userRemain}`;
    }
    if (avatarLimitInfo) {
        const now = new Date();
        const lastAvatarUpdate = data.avatar_updated_at ? new Date(data.avatar_updated_at) : null;
        const avatarCount = data.avatar_update_count || 0;
        const isTodayAvatar = lastAvatarUpdate ? isToday(lastAvatarUpdate) : false;
        const avatarRemain = isTodayAvatar ? Math.max(0, 2 - avatarCount) : 2;
        avatarLimitInfo.textContent = `今日剩余修改次数: ${avatarRemain}`;
    }
}

// ================================================================
// 10. 更新用户名
// ================================================================
async function updateUsername(newUsername) {
    if (!profileData) return false;
    const data = profileData;
    const now = new Date();
    const lastUpdate = data.username_updated_at ? new Date(data.username_updated_at) : null;
    const count = data.username_update_count || 0;
    const isTodayUpdate = lastUpdate ? isToday(lastUpdate) : false;

    let newCount = 1;
    let newDate = now.toISOString();
    if (isTodayUpdate) {
        if (count >= 2) {
            showToast('今日修改次数已达上限（2次）', 'error');
            return false;
        }
        newCount = count + 1;
        newDate = data.username_updated_at;
    } else {
        newCount = 1;
        newDate = now.toISOString();
    }

    try {
        const { error } = await supabaseClient
            .from('profiles')
            .update({
                username: newUsername.trim(),
                username_updated_at: newDate,
                username_update_count: newCount,
                updated_at: now.toISOString()
            })
            .eq('id', currentUser.id);

        if (error) throw error;
        showToast('用户名更新成功！', 'success');
        await loadProfileData();
        return true;
    } catch (err) {
        console.error('更新用户名失败:', err);
        showToast('更新失败: ' + err.message, 'error');
        return false;
    }
}

// ================================================================
// 11. 更新头像（上传至 Storage）
// ================================================================
async function updateAvatar(file) {
    if (!file || !currentUser) return false;
    if (!profileData) {
        await loadProfileData();
        if (!profileData) return false;
    }

    const data = profileData;
    const now = new Date();
    const lastUpdate = data.avatar_updated_at ? new Date(data.avatar_updated_at) : null;
    const count = data.avatar_update_count || 0;
    const isTodayUpdate = lastUpdate ? isToday(lastUpdate) : false;

    let newCount = 1;
    let newDate = now.toISOString();
    if (isTodayUpdate) {
        if (count >= 2) {
            showToast('今日修改次数已达上限（2次）', 'error');
            return false;
        }
        newCount = count + 1;
        newDate = data.avatar_updated_at;
    } else {
        newCount = 1;
        newDate = now.toISOString();
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `${currentUser.id}/${fileName}`;

    try {
        const { error: uploadError } = await supabaseClient.storage
            .from('avatars')
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabaseClient.storage
            .from('avatars')
            .getPublicUrl(filePath);
        const avatarUrl = urlData.publicUrl;

        const { error: updateError } = await supabaseClient
            .from('profiles')
            .update({
                avatar_url: avatarUrl,
                avatar_updated_at: newDate,
                avatar_update_count: newCount,
                updated_at: now.toISOString()
            })
            .eq('id', currentUser.id);

        if (updateError) throw updateError;

        showToast('头像更新成功！', 'success');
        await loadProfileData();
        return true;
    } catch (err) {
        console.error('上传头像失败:', err);
        showToast('上传失败: ' + err.message, 'error');
        return false;
    }
}

// ================================================================
// 12. 个人空间 UI 交互绑定
// ================================================================
function initProfileUI() {
    profileAvatar = document.getElementById('profileAvatar');
    profileUsernameDisplay = document.getElementById('profileUsernameDisplay');
    usernameLimitInfo = document.getElementById('usernameLimitInfo');
    avatarLimitInfo = document.getElementById('avatarLimitInfo');

    editUsernameBtn = document.getElementById('editUsernameBtn');
    usernameEditArea = document.getElementById('usernameEditArea');
    usernameInput = document.getElementById('usernameInput');
    saveUsernameBtn = document.getElementById('saveUsernameBtn');
    cancelUsernameBtn = document.getElementById('cancelUsernameBtn');

    uploadAvatarBtn = document.getElementById('uploadAvatarBtn');
    avatarFileInput = document.getElementById('avatarFileInput');

    if (!editUsernameBtn || !uploadAvatarBtn) return; // 若元素不存在则跳过

    editUsernameBtn.addEventListener('click', () => {
        usernameEditArea.style.display = 'block';
        usernameInput.value = profileUsernameDisplay.textContent;
        editUsernameBtn.style.display = 'none';
    });

    cancelUsernameBtn.addEventListener('click', () => {
        usernameEditArea.style.display = 'none';
        editUsernameBtn.style.display = 'inline-flex';
    });

    saveUsernameBtn.addEventListener('click', async () => {
        const newName = usernameInput.value.trim();
        if (!newName) {
            showToast('用户名不能为空', 'error');
            return;
        }
        const success = await updateUsername(newName);
        if (success) {
            usernameEditArea.style.display = 'none';
            editUsernameBtn.style.display = 'inline-flex';
        }
    });

    uploadAvatarBtn.addEventListener('click', () => {
        avatarFileInput.click();
    });

    avatarFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            showToast('请上传图片文件', 'error');
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            showToast('图片大小不能超过 2MB', 'error');
            return;
        }
        const success = await updateAvatar(file);
        if (success) {
            avatarFileInput.value = '';
        }
    });
}

// ================================================================
// 13. 模态框控制
// ================================================================
function openAuthModal(tab = 'login') {
    if (!authModal) return;
    authModal.classList.add('active');
    switchTab(tab);
    loginError.classList.remove('show');
    registerError.classList.remove('show');
    loginForm.reset();
    registerForm.reset();
}

function closeAuthModal() {
    if (authModal) authModal.classList.remove('active');
}

function openAddModal() {
    if (!currentUser) {
        showToast('请先登录再添加收藏', 'error');
        openAuthModal('login');
        return;
    }
    addModal.classList.add('active');
    addForm.reset();
    addError.classList.remove('show');
}

function closeAddModal() {
    addModal.classList.remove('active');
}

function switchTab(tab) {
    document.querySelectorAll('#authTabs button').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    tabLogin.classList.toggle('active', tab === 'login');
    tabRegister.classList.toggle('active', tab === 'register');
    const titles = { login: '欢迎回来', register: '加入我们' };
    const subs = {
        login: '登录你的账号，继续分享收藏',
        register: '创建账号，分享你发现的宝藏网站'
    };
    document.getElementById('authModalTitle').textContent = titles[tab] || '欢迎';
    document.getElementById('authModalSub').textContent = subs[tab] || '';
}

// ================================================================
// 14. 数据操作 — 网站
// ================================================================
async function loadWebsites() {
    if (!grid) return;
    grid.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <span>加载中...</span>
        </div>
    `;

    try {
        const { data, error } = await supabaseClient
            .from('websites')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column:1/-1;">
                    <div class="empty-icon">📭</div>
                    <h3>还没有收藏</h3>
                    <p>成为第一个分享网站的人吧！</p>
                    ${currentUser ? '<button class="btn btn-primary mt-8" onclick="window.openAddModal()">➕ 添加收藏</button>' : '<button class="btn btn-primary mt-8" onclick="window.openAuthModal(\'login\')">登录后分享</button>'}
                </div>
            `;
            statsCount.textContent = '共 0 个网站';
            return;
        }

        statsCount.textContent = `共 ${data.length} 个网站`;
        renderCards(data);
    } catch (err) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1;">
                <div class="empty-icon">⚠️</div>
                <h3>加载失败</h3>
                <p>${err.message || '请检查网络或配置'}</p>
                <button class="btn btn-outline mt-8" onclick="window.loadWebsites()">重试</button>
            </div>
        `;
        console.error('加载网站失败:', err);
    }
}

function renderCards(websites) {
    const html = websites.map((item) => {
        const domain = getDomain(item.url);
        const isOwner = currentUser && item.user_id === currentUser.id;
        return `
            <div class="card" data-id="${item.id}">
                <div class="card-header">
                    <div class="card-icon">${domain.charAt(0).toUpperCase() || '🌐'}</div>
                    <div class="card-title">
                        <a href="${item.url}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a>
                    </div>
                </div>
                <div class="card-url">
                    🔗 <a href="${item.url}" target="_blank" rel="noopener">${escapeHtml(domain)}</a>
                </div>
                ${item.description ? `<div class="card-desc">${escapeHtml(item.description)}</div>` : ''}
                <div class="card-footer">
                    <span class="category">${escapeHtml(item.category || '未分类')}</span>
                    <span class="user">
                        <span>${escapeHtml(item.user_email || '匿名')}</span>
                        <span class="dot"></span>
                        <span>${formatDate(item.created_at)}</span>
                    </span>
                </div>
                ${isOwner ? `
                    <div class="card-actions">
                        <button class="btn btn-danger btn-sm delete-btn" data-id="${item.id}">删除</button>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');

    grid.innerHTML = `<div class="grid">${html}</div>`;

    grid.querySelectorAll('.delete-btn').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
            const id = btn.dataset.id;
            if (confirm('确定要删除这条收藏吗？')) {
                await deleteWebsite(id);
            }
        });
    });
}

async function addWebsite(title, url, description, category) {
    if (!currentUser) {
        showToast('请先登录', 'error');
        return false;
    }

    try {
        const { data, error } = await supabaseClient
            .from('websites')
            .insert([{
                title: title.trim(),
                url: url.trim(),
                description: description.trim() || null,
                category: category.trim() || null,
                user_id: currentUser.id,
                user_email: currentUser.email,
            }])
            .select();

        if (error) throw error;

        showToast('🎉 分享成功！', 'success');
        await loadWebsites();
        return true;
    } catch (err) {
        console.error('添加失败:', err);
        showToast('添加失败: ' + err.message, 'error');
        return false;
    }
}

async function deleteWebsite(id) {
    try {
        const { error } = await supabaseClient
            .from('websites')
            .delete()
            .eq('id', id)
            .eq('user_id', currentUser.id);

        if (error) throw error;
        showToast('已删除', 'info');
        await loadWebsites();
    } catch (err) {
        console.error('删除失败:', err);
        showToast('删除失败: ' + err.message, 'error');
    }
}

// ================================================================
// 15. 实时订阅
// ================================================================
let subscription = null;

function subscribeWebsites() {
    if (subscription) {
        subscription.unsubscribe();
        subscription = null;
    }

    subscription = supabaseClient
        .channel('public:websites')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'websites' },
            () => {
                loadWebsites();
            }
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('✅ 实时订阅已开启');
            }
        });
}

// ================================================================
// 16. 初始化
// ================================================================
function initApp() {
    // 第一步：获取所有 DOM 元素
    navActions = document.getElementById('navActions');
    grid = document.getElementById('websiteGrid');
    statsCount = document.getElementById('statsCount');
    fabAdd = document.getElementById('fabAdd');
    homeView = document.getElementById('homeView');
    profileView = document.getElementById('profileView');

    authModal = document.getElementById('authModal');
    authModalClose = document.getElementById('authModalClose');
    authTabs = document.getElementById('authTabs');
    tabLogin = document.getElementById('tabLogin');
    tabRegister = document.getElementById('tabRegister');
    loginForm = document.getElementById('loginForm');
    registerForm = document.getElementById('registerForm');
    loginEmail = document.getElementById('loginEmail');
    loginPassword = document.getElementById('loginPassword');
    registerUsername = document.getElementById('registerUsername');
    registerEmail = document.getElementById('registerEmail');
    registerPassword = document.getElementById('registerPassword');
    loginError = document.getElementById('loginError');
    registerError = document.getElementById('registerError');

    addModal = document.getElementById('addModal');
    addModalClose = document.getElementById('addModalClose');
    addModalCancel = document.getElementById('addModalCancel');
    addForm = document.getElementById('addForm');
    addTitle = document.getElementById('addTitle');
    addUrl = document.getElementById('addUrl');
    addDesc = document.getElementById('addDesc');
    addCategory = document.getElementById('addCategory');
    addError = document.getElementById('addError');

    toastContainer = document.getElementById('toastContainer');

    // 第二步：初始化个人空间 UI（元素已存在）
    initProfileUI();

    // 第三步：绑定事件
    brandLink = document.getElementById('brandLink');
    if (brandLink) {
        brandLink.addEventListener('click', showHomeView);
    }

    authModalClose.addEventListener('click', closeAuthModal);
    authModal.addEventListener('click', (e) => {
        if (e.target === authModal) closeAuthModal();
    });

    authTabs.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (btn && btn.dataset.tab) {
            switchTab(btn.dataset.tab);
        }
    });

    loginForm.addEventListener('submit', handleLogin);
    registerForm.addEventListener('submit', handleRegister);

    loginPassword.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') loginForm.dispatchEvent(new Event('submit'));
    });
    registerPassword.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') registerForm.dispatchEvent(new Event('submit'));
    });

    fabAdd.addEventListener('click', openAddModal);
    addModalClose.addEventListener('click', closeAddModal);
    addModalCancel.addEventListener('click', closeAddModal);
    addModal.addEventListener('click', (e) => {
        if (e.target === addModal) closeAddModal();
    });

    addForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        addError.classList.remove('show');

        const title = addTitle.value.trim();
        const url = addUrl.value.trim();
        const description = addDesc.value.trim();
        const category = addCategory.value.trim();

        if (!title || !url) {
            addError.textContent = '标题和网址为必填项';
            addError.classList.add('show');
            return;
        }

        try {
            new URL(url);
        } catch {
            addError.textContent = '请输入有效的网址（包含 https://）';
            addError.classList.add('show');
            return;
        }

        const success = await addWebsite(title, url, description, category);
        if (success) {
            closeAddModal();
            addForm.reset();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (authModal.classList.contains('active')) closeAuthModal();
            if (addModal.classList.contains('active')) closeAddModal();
        }
    });

    // 暴露全局函数
    window.openAddModal = openAddModal;
    window.openAuthModal = openAuthModal;
    window.loadWebsites = loadWebsites;
    window.showHomeView = showHomeView;
    window.showProfileView = showProfileView;

    // 检查配置
    if (SUPABASE_CONFIG.url.includes('YOUR_PROJECT')) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1; padding:40px 20px;">
                <div class="empty-icon">⚙️</div>
                <h3>请先配置 Supabase</h3>
                <p>在 <code>script.js</code> 开头的 <code>SUPABASE_CONFIG</code> 中填入你的 Supabase URL 和 anon key</p>
                <p style="font-size:13px;color:var(--gray-400);margin-top:8px;">
                    然后创建 <code>websites</code> 和 <code>profiles</code> 表，并配置 Storage
                </p>
                <button class="btn btn-outline mt-8" onclick="location.reload()">重新加载</button>
            </div>
        `;
        return;
    }

    // 最后启动（此时所有 DOM 已就绪）
    loadSession().catch((err) => {
        console.error('初始化失败:', err);
        showToast('初始化失败，请检查控制台', 'error');
    });
    subscribeWebsites();

    console.log('⭐ StarSharing 已启动 (含个人空间)');
}

// 等待 DOM 加载
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}