// ================================================================
// 1. 配置 ——— 请替换为你的 Supabase 项目信息
// ================================================================
const SUPABASE_CONFIG = {
    url: 'https://mqqkvolvljixdztvrrfw.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xcWt2b2x2bGppeGR6dHZycmZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyOTEzODAsImV4cCI6MjEwMDg2NzM4MH0.RBH9KghNTYtnteVDvei7xYz3K2AsU6R7QLVbx9nofcU',
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
let navActions, grid, statsCount, navbarTabs, searchInput;
let authModal, authModalClose, authTabs, tabLogin, tabRegister;
let loginForm, registerForm, loginEmail, loginPassword;
let registerUsername, registerEmail, registerPassword, loginError, registerError;
let toastContainer;
let bookmarkSquareView, importView, profileView, brandLink;
let addFormInline, addTitleInline, addUrlInline, addDescInline, addCategoryInline, addErrorInline;
let allWebsitesData = [];
let profileAvatar, profileUsernameDisplay, usernameLimitInfo, avatarLimitInfo;
let editUsernameBtn, usernameEditArea, usernameInput, saveUsernameBtn, cancelUsernameBtn;
let avatarFileInput;
let cropModal, cropCanvas, cropCtx, cropImage, cropScale = 1, cropOffsetX = 0, cropOffsetY = 0;
let isDragging = false, dragStartX, dragStartY, dragStartOffsetX, dragStartOffsetY;
let cropFile = null;

// ================================================================
// 4. 工具函数
// ================================================================
function showToast(message, type = 'info') {
    let container = toastContainer || document.body;
    if (!container) {
        setTimeout(() => showToast(message, type), 50);
        return;
    }
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    requestAnimationFrame(() => { el.classList.add('show'); });
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
    try { const u = new URL(url); return u.hostname.replace(/^www\./, ''); } catch { return url; }
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

// ===== 获取网站信息（标题 + 图标） =====
async function fetchWebsiteInfoInline(url) {
    let normalizedUrl = url.trim();
    if (!/^https?:\/\//i.test(normalizedUrl)) normalizedUrl = 'https://' + normalizedUrl;

    const faviconPreview = document.getElementById('faviconPreviewInline');
    const urlLoading = document.getElementById('urlLoadingInline');
    const titleInput = document.getElementById('addTitleInline');

    const userHasTitle = titleInput && titleInput.value.trim().length > 0;
    if (urlLoading) urlLoading.style.display = 'inline-block';
    if (faviconPreview) faviconPreview.style.display = 'none';

    try {
        const faviconDomain = new URL(normalizedUrl).hostname;
        const faviconUrl = `https://favicone.com/${faviconDomain}?s=64`;
        if (faviconPreview) { faviconPreview.src = faviconUrl; faviconPreview.style.display = 'block'; }
    } catch (e) {}

    if (userHasTitle) { if (urlLoading) urlLoading.style.display = 'none'; return; }

    const proxyFetchers = [
        async (targetUrl) => {
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            try {
                const resp = await fetch(proxyUrl, { signal: controller.signal });
                clearTimeout(timeoutId);
                if (!resp.ok) throw new Error('allorigins 非 200');
                return await resp.text();
            } catch (e) { clearTimeout(timeoutId); throw e; }
        },
        async (targetUrl) => {
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            try {
                const resp = await fetch(proxyUrl, { signal: controller.signal });
                clearTimeout(timeoutId);
                if (!resp.ok) throw new Error('corsproxy 非 200');
                return await resp.text();
            } catch (e) { clearTimeout(timeoutId); throw e; }
        },
    ];

    let html = null;
    for (const fetcher of proxyFetchers) {
        try { html = await fetcher(normalizedUrl); if (html) break; } catch (e) { console.warn('代理失败，尝试下一个', e); }
    }

    if (html) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            let title = doc.querySelector('title')?.textContent?.trim() || '';
            if (title) {
                title = title.replace(/\s+/g, ' ').trim();
                if (titleInput && !titleInput.value.trim()) titleInput.value = title;
            }
        } catch (e) { console.warn('解析 HTML 标题失败', e); }
    }

    if (titleInput && !titleInput.value.trim()) {
        try { titleInput.value = new URL(normalizedUrl).hostname.replace(/^www\./, ''); } catch (e) {}
    }
    if (urlLoading) urlLoading.style.display = 'none';
}

// ================================================================
// 5. 认证状态管理
// ================================================================
let currentUser = null;

async function loadSession() {
    if (!supabaseClient || !supabaseClient.auth) { console.error('Supabase 客户端未正确初始化'); return; }
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) { console.warn('获取 session 失败:', error); return; }
    currentUser = data?.session?.user || null;
    updateUI();
    await loadWebsites();
    if (currentUser) loadProfileData();
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
            if (profileView && profileView.style.display !== 'none') switchMainView('bookmarkSquare');
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
        const username = profileData?.username || currentUser.user_metadata?.username || '用户';
        const avatarUrl = profileData?.avatar_url || '';
        let avatarHtml = '';
        if (avatarUrl) {
            avatarHtml = `<img src="${avatarUrl}" alt="avatar" />`;
        } else {
            avatarHtml = `<span class="avatar">${getInitials(email)}</span>`;
        }
        navActions.innerHTML = `
            <div class="navbar-user-info" id="userAvatarBtn">
                <div class="navbar-avatar">${avatarHtml}</div>
                <div class="navbar-user-text">
                    <div class="navbar-username">${escapeHtml(username)}</div>
                    <div class="navbar-email">${escapeHtml(email)}</div>
                </div>
            </div>
            <button class="btn btn-outline btn-sm" id="logoutBtn">退出</button>
        `;
        document.getElementById('userAvatarBtn')?.addEventListener('click', () => { if (currentUser) showProfileView(); });
        document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
    } else {
        navActions.innerHTML = `
            <button class="btn btn-outline btn-sm" id="loginBtn">登录</button>
            <button class="btn btn-primary btn-sm" id="registerBtn">注册</button>
        `;
        document.getElementById('loginBtn')?.addEventListener('click', () => openAuthModal('login'));
        document.getElementById('registerBtn')?.addEventListener('click', () => openAuthModal('register'));
    }
}

// ================================================================
// 7. 认证操作
// ================================================================
async function handleLogin(e) {
    e.preventDefault();
    loginError.classList.remove('show');
    const email = loginEmail.value.trim();
    const password = loginPassword.value;
    if (!email || !password) { loginError.textContent = '请填写完整信息'; loginError.classList.add('show'); return; }
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
    if (!username || !email || !password) { registerError.textContent = '请填写完整信息'; registerError.classList.add('show'); return; }
    if (password.length < 6) { registerError.textContent = '密码至少 6 位'; registerError.classList.add('show'); return; }
    try {
        const { data, error } = await supabaseClient.auth.signUp({ email, password, options: { data: { username } } });
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
    try { await supabaseClient.auth.signOut(); } catch (err) { showToast('退出失败: ' + err.message, 'error'); }
}

// ================================================================
// 8. 视图切换
// ================================================================
function switchMainView(viewName) {
    if (!bookmarkSquareView || !importView || !profileView) return;
    bookmarkSquareView.style.display = viewName === 'bookmarkSquare' ? 'block' : 'none';
    importView.style.display = viewName === 'importView' ? 'block' : 'none';
    profileView.style.display = viewName === 'profileView' ? 'block' : 'none';
    document.getElementById('mainContent').style.height = (viewName === 'profileView') ? '100%' : 'auto';

    // 更新导航标签激活状态
    if (navbarTabs) {
        navbarTabs.querySelectorAll('.navbar-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.view === viewName);
        });
    }
}

function showProfileView() {
    if (!currentUser) { showToast('请先登录', 'error'); return; }
    switchMainView('profileView');
    loadProfileData();
}

// ================================================================
// 9. 个人资料数据加载与更新
// ================================================================
let profileData = null;

async function loadProfileData() {
    if (!currentUser) return;
    try {
        const { data, error } = await supabaseClient.from('profiles').select('*').eq('id', currentUser.id).single();
        if (error && error.code !== 'PGRST116') throw error;
        if (!data) {
            const { error: insertError } = await supabaseClient.from('profiles').insert([{ id: currentUser.id, username: currentUser.user_metadata?.username || '用户' }]);
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
    if (data.avatar_url) profileAvatar.src = data.avatar_url; else profileAvatar.src = '';
    if (profileUsernameDisplay) profileUsernameDisplay.textContent = data.username || '未设置';
    const emailDisplay = document.getElementById('profileEmailDisplay');
    if (emailDisplay && currentUser) emailDisplay.textContent = currentUser.email || '';
    updateLimitInfo(data);
    updateUI();
}

function updateLimitInfo(data) {
    if (usernameLimitInfo) {
        const lastUserUpdate = data.username_updated_at ? new Date(data.username_updated_at) : null;
        const userCount = data.username_update_count || 0;
        const isTodayUser = lastUserUpdate ? isToday(lastUserUpdate) : false;
        const userRemain = isTodayUser ? Math.max(0, 2 - userCount) : 2;
        usernameLimitInfo.textContent = `今日剩余修改次数: ${userRemain}`;
    }
    if (avatarLimitInfo) {
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
        if (count >= 2) { showToast('今日修改次数已达上限（2次）', 'error'); return false; }
        newCount = count + 1;
        newDate = data.username_updated_at;
    } else { newCount = 1; newDate = now.toISOString(); }
    try {
        const { error } = await supabaseClient.from('profiles').update({
            username: newUsername.trim(),
            username_updated_at: newDate,
            username_update_count: newCount,
            updated_at: now.toISOString()
        }).eq('id', currentUser.id);
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
    if (!profileData) { await loadProfileData(); if (!profileData) return false; }
    const data = profileData;
    const now = new Date();
    const lastUpdate = data.avatar_updated_at ? new Date(data.avatar_updated_at) : null;
    const count = data.avatar_update_count || 0;
    const isTodayUpdate = lastUpdate ? isToday(lastUpdate) : false;
    let newCount = 1;
    let newDate = now.toISOString();
    if (isTodayUpdate) {
        if (count >= 2) { showToast('今日修改次数已达上限（2次）', 'error'); return false; }
        newCount = count + 1; newDate = data.avatar_updated_at;
    } else { newCount = 1; newDate = now.toISOString(); }
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `${currentUser.id}/${fileName}`;
    try {
        const { error: uploadError } = await supabaseClient.storage.from('avatars').upload(filePath, file);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabaseClient.storage.from('avatars').getPublicUrl(filePath);
        const avatarUrl = urlData.publicUrl;
        const { error: updateError } = await supabaseClient.from('profiles').update({
            avatar_url: avatarUrl, avatar_updated_at: newDate, avatar_update_count: newCount, updated_at: now.toISOString()
        }).eq('id', currentUser.id);
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
    const avatarWrapper = document.getElementById('avatarWrapper');
    avatarFileInput = document.getElementById('avatarFileInput');

    if (avatarWrapper && avatarFileInput) {
        avatarWrapper.addEventListener('click', () => avatarFileInput.click());
    }
    if (avatarFileInput) {
        avatarFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (!file.type.startsWith('image/')) { showToast('请上传图片文件', 'error'); avatarFileInput.value = ''; return; }
            if (file.size > 5 * 1024 * 1024) { showToast('图片大小不能超过 5MB', 'error'); avatarFileInput.value = ''; return; }
            openCropModal(file);
            avatarFileInput.value = '';
        });
    }
    if (!editUsernameBtn) return;
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
        if (!newName) { showToast('用户名不能为空', 'error'); return; }
        const success = await updateUsername(newName);
        if (success) { usernameEditArea.style.display = 'none'; editUsernameBtn.style.display = 'inline-flex'; }
    });
}

// ================================================================
// 13. 模态框控制
// ================================================================
function openAuthModal(tab = 'login') {
    if (!authModal) return;
    authModal.classList.add('active');
    switchAuthTab(tab);
    loginError.classList.remove('show');
    registerError.classList.remove('show');
    loginForm.reset();
    registerForm.reset();
}
function closeAuthModal() { if (authModal) authModal.classList.remove('active'); }
function switchAuthTab(tab) {
    document.querySelectorAll('#authTabs button').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
    tabLogin.classList.toggle('active', tab === 'login');
    tabRegister.classList.toggle('active', tab === 'register');
    document.getElementById('authModalTitle').textContent = tab === 'login' ? '欢迎回来' : '加入我们';
    document.getElementById('authModalSub').textContent = tab === 'login' ? '登录你的账号，继续分享收藏' : '创建账号，分享你发现的宝藏网站';
}

// ================================================================
// 14. 数据操作 — 网站
// ================================================================
async function loadWebsites() {
    if (!grid) return;
    grid.innerHTML = `<div class="loading"><div class="spinner"></div><span>加载中...</span></div>`;
    try {
        const { data, error } = await supabaseClient.from('websites').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        allWebsitesData = data || [];
        filterAndRenderCards();
    } catch (err) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1;">
                <div class="empty-icon">⚠️</div>
                <h3>加载失败</h3>
                <p>${err.message || '请检查网络或配置'}</p>
                <button class="btn btn-outline mt-8" onclick="window.loadWebsites()">重试</button>
            </div>`;
        console.error('加载网站失败:', err);
    }
}

function filterAndRenderCards() {
    const keyword = (searchInput && searchInput.value || '').trim().toLowerCase();
    let filtered = allWebsitesData;
    if (keyword) {
        filtered = allWebsitesData.filter(item => (item.title || '').toLowerCase().includes(keyword));
    }
    statsCount.textContent = keyword ? `找到 ${filtered.length} 个结果（共 ${allWebsitesData.length} 个）` : `共 ${allWebsitesData.length} 个网站`;
    renderCards(filtered);
}

function renderCards(websites) {
    if (!websites || websites.length === 0) {
        const keyword = (searchInput && searchInput.value || '').trim();
        grid.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1;">
                <div class="empty-icon">📭</div>
                <h3>${keyword ? '没有匹配的收藏' : '还没有收藏'}</h3>
                <p>${keyword ? '换个搜索词试试' : '去"导入"板块添加第一个收藏吧！'}</p>
            </div>`;
        return;
    }
    const html = websites.map((item) => {
        const domain = getDomain(item.url);
        const isOwner = currentUser && item.user_id === currentUser.id;
        const displayName = item.user_username || item.user_email || '匿名';
        return `
            <div class="card" data-id="${item.id}">
                <div class="card-header">
                    <div class="card-icon">
                        <img class="card-icon-img" src="https://favicone.com/${domain}?s=32" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
                        <span class="card-icon-fallback" style="display:none;">${(domain.charAt(0) || '🌐').toUpperCase()}</span>
                    </div>
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
                        <span>${escapeHtml(displayName)}</span>
                        <span class="dot"></span>
                        <span>${formatDate(item.created_at)}</span>
                    </span>
                </div>
                ${isOwner ? `<div class="card-actions"><button class="btn btn-danger btn-sm delete-btn" data-id="${item.id}">删除</button></div>` : ''}
            </div>`;
    }).join('');
    grid.innerHTML = `<div class="grid">${html}</div>`;
    grid.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = btn.dataset.id;
            if (confirm('确定要删除这条收藏吗？')) await deleteWebsite(id);
        });
    });
}

async function addWebsite(title, url, description, category) {
    if (!currentUser) { showToast('请先登录', 'error'); return false; }
    try {
        const { data, error } = await supabaseClient.from('websites').insert([{
            title: title.trim(),
            url: url.trim(),
            description: description.trim() || null,
            category: category.trim() || null,
            user_id: currentUser.id,
            user_email: currentUser.email,
            user_username: profileData?.username || currentUser.user_metadata?.username || currentUser.email,
        }]).select();
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
        const { error } = await supabaseClient.from('websites').delete().eq('id', id).eq('user_id', currentUser.id);
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
    if (subscription) { subscription.unsubscribe(); subscription = null; }
    subscription = supabaseClient.channel('public:websites')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'websites' }, () => { loadWebsites(); })
        .subscribe((status) => { if (status === 'SUBSCRIBED') console.log('✅ 实时订阅已开启'); });
}

// ================================================================
// 16. 初始化
// ================================================================
function initApp() {
    // ========== 1. 获取所有 DOM 元素 ==========
    navActions = document.getElementById('navActions');
    grid = document.getElementById('websiteGrid');
    statsCount = document.getElementById('statsCount');
    navbarTabs = document.getElementById('navbarTabs');
    searchInput = document.getElementById('searchInput');
    bookmarkSquareView = document.getElementById('bookmarkSquareView');
    importView = document.getElementById('importView');
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

    toastContainer = document.getElementById('toastContainer');
    cropModal = document.getElementById('cropModal');
    const cropModalClose = document.getElementById('cropModalClose');
    const cropCancelBtn = document.getElementById('cropCancelBtn');
    const cropConfirmBtn = document.getElementById('cropConfirmBtn');
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const resetCropBtn = document.getElementById('resetCropBtn');
    cropCanvas = document.getElementById('cropCanvas');
    if (cropCanvas) cropCtx = cropCanvas.getContext('2d');

    // 导入板块表单
    addFormInline = document.getElementById('addFormInline');
    addTitleInline = document.getElementById('addTitleInline');
    addUrlInline = document.getElementById('addUrlInline');
    addDescInline = document.getElementById('addDescInline');
    addCategoryInline = document.getElementById('addCategoryInline');
    addErrorInline = document.getElementById('addErrorInline');

    // ========== 2. 初始化个人空间 UI ==========
    initProfileUI();

    // ========== 3. 导航栏标签切换 ==========
    if (navbarTabs) {
        navbarTabs.addEventListener('click', (e) => {
            const tab = e.target.closest('.navbar-tab');
            if (!tab) return;
            const viewName = tab.dataset.view;
            switchMainView(viewName);
            if (viewName === 'profileView') showProfileView();
        });
    }

    // 品牌链接 → 书签广场
    brandLink = document.getElementById('brandLink');
    if (brandLink) brandLink.addEventListener('click', () => switchMainView('bookmarkSquare'));

    // ========== 4. 搜索输入实时过滤 ==========
    if (searchInput) {
        searchInput.addEventListener('input', () => filterAndRenderCards());
    }

    // ========== 5. 导入板块 — 单个导入表单 ==========
    if (addUrlInline) {
        addUrlInline.addEventListener('blur', function() {
            const url = this.value.trim();
            if (url) fetchWebsiteInfoInline(url);
        });
    }
    if (addFormInline) {
        addFormInline.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (addErrorInline) addErrorInline.classList.remove('show');
            const title = addTitleInline.value.trim();
            const url = addUrlInline.value.trim();
            const description = addDescInline.value.trim();
            const category = addCategoryInline.value.trim();
            if (!title || !url) { if (addErrorInline) { addErrorInline.textContent = '标题和网址为必填项'; addErrorInline.classList.add('show'); } return; }
            try { new URL(url); } catch { if (addErrorInline) { addErrorInline.textContent = '请输入有效的网址（包含 https://）'; addErrorInline.classList.add('show'); } return; }
            const success = await addWebsite(title, url, description, category);
            if (success) addFormInline.reset();
        });
    }

    // ========== 5b. 从收藏夹 HTML 导入 ==========
    const bookmarkFileInput = document.getElementById('bookmarkFileInput');
    const bookmarkFileInputRetry = document.getElementById('bookmarkFileInputRetry');
    const importAllBtn = document.getElementById('importAllBookmarksBtn');
    const importPlaceholder = document.getElementById('importPlaceholder');
    const bookmarkImportResult = document.getElementById('bookmarkImportResult');
    const bookmarkImportCount = document.getElementById('bookmarkImportCount');
    const bookmarkList = document.getElementById('bookmarkList');
    let parsedBookmarks = [];

    if (bookmarkFileInput) {
        bookmarkFileInput.addEventListener('change', (e) => handleBookmarkFile(e.target.files[0]));
    }
    if (bookmarkFileInputRetry) {
        bookmarkFileInputRetry.addEventListener('change', (e) => handleBookmarkFile(e.target.files[0]));
    }
    if (importAllBtn) {
        importAllBtn.addEventListener('click', () => importAllBookmarks());
    }

    function handleBookmarkFile(file) {
        if (!file) return;
        if (!currentUser) { showToast('请先登录', 'error'); return; }
        const reader = new FileReader();
        reader.onload = (e) => {
            const html = e.target.result;
            parsedBookmarks = parseBookmarkHTML(html);
            renderBookmarkList(parsedBookmarks);
        };
        reader.readAsText(file);
    }

    function parseBookmarkHTML(html) {
        const bookmarks = [];
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const links = doc.querySelectorAll('a[href]');
        links.forEach(link => {
            const url = link.getAttribute('href') || '';
            const title = (link.textContent || '').replace(/\s+/g, ' ').trim();
            // 过滤非 HTTP 链接（如 javascript:、file: 等）
            if (!/^https?:\/\//i.test(url)) return;
            // 去重（按 URL）
            if (bookmarks.some(b => b.url === url)) return;
            bookmarks.push({ title: title || getDomain(url), url });
        });
        return bookmarks;
    }

    function renderBookmarkList(bookmarks) {
        if (!importPlaceholder || !bookmarkImportResult || !bookmarkImportCount || !bookmarkList) return;
        importPlaceholder.style.display = 'none';
        bookmarkImportResult.style.display = 'block';

        if (bookmarks.length === 0) {
            bookmarkImportCount.textContent = '未找到有效书签';
            bookmarkList.innerHTML = '<div class="empty-state" style="padding:20px;"><p>文件中没有有效的 HTTP 链接</p></div>';
            return;
        }
        bookmarkImportCount.textContent = `找到 ${bookmarks.length} 个书签`;
        bookmarkList.innerHTML = bookmarks.map((b, i) => `
            <div class="bookmark-item">
                <span class="bookmark-item-index">${i + 1}</span>
                <div class="bookmark-item-info">
                    <div class="bookmark-item-title">${escapeHtml(b.title)}</div>
                    <div class="bookmark-item-url">${escapeHtml(b.url)}</div>
                </div>
            </div>
        `).join('');
    }

    async function importAllBookmarks() {
        if (!currentUser) { showToast('请先登录', 'error'); return; }
        if (!parsedBookmarks || parsedBookmarks.length === 0) { showToast('没有可导入的书签', 'error'); return; }
        if (!importAllBtn) return;
        importAllBtn.disabled = true;
        importAllBtn.textContent = '导入中...';
        let successCount = 0;
        let failCount = 0;
        for (const bm of parsedBookmarks) {
            try {
                const { error } = await supabaseClient.from('websites').insert([{
                    title: (bm.title || getDomain(bm.url)).trim(),
                    url: bm.url.trim(),
                    description: null,
                    category: null,
                    user_id: currentUser.id,
                    user_email: currentUser.email,
                    user_username: profileData?.username || currentUser.user_metadata?.username || currentUser.email,
                }]);
                if (error) { failCount++; } else { successCount++; }
            } catch (err) { failCount++; }
        }
        showToast(`导入完成！成功 ${successCount} 条` + (failCount > 0 ? `，失败 ${failCount} 条` : ''), successCount > 0 ? 'success' : 'error');
        importAllBtn.disabled = false;
        importAllBtn.textContent = '全部导入';
        await loadWebsites();
    }

    // ========== 6. 认证模态框事件 ==========
    authModalClose.addEventListener('click', closeAuthModal);
    authModal.addEventListener('click', (e) => { if (e.target === authModal) closeAuthModal(); });
    authTabs.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (btn && btn.dataset.tab) switchAuthTab(btn.dataset.tab);
    });
    loginForm.addEventListener('submit', handleLogin);
    registerForm.addEventListener('submit', handleRegister);
    loginPassword.addEventListener('keydown', (e) => { if (e.key === 'Enter') loginForm.dispatchEvent(new Event('submit')); });
    registerPassword.addEventListener('keydown', (e) => { if (e.key === 'Enter') registerForm.dispatchEvent(new Event('submit')); });

    // ========== 7. 裁剪模态框事件 ==========
    if (cropModal) {
        cropModalClose.addEventListener('click', closeCropModal);
        cropCancelBtn.addEventListener('click', closeCropModal);
        cropModal.addEventListener('click', (e) => { if (e.target === cropModal) closeCropModal(); });
        cropConfirmBtn.addEventListener('click', confirmCrop);
        zoomInBtn.addEventListener('click', () => adjustCropZoom(0.1));
        zoomOutBtn.addEventListener('click', () => adjustCropZoom(-0.1));
        resetCropBtn.addEventListener('click', resetCropTransform);
        cropCanvas.addEventListener('mousedown', startDrag);
        window.addEventListener('mousemove', onDrag);
        window.addEventListener('mouseup', endDrag);
        cropCanvas.addEventListener('touchstart', startDragTouch, { passive: false });
        window.addEventListener('touchmove', onDragTouch, { passive: false });
        window.addEventListener('touchend', endDrag, { passive: false });
    }

    // ========== 8. 全局键盘事件 ==========
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (authModal.classList.contains('active')) closeAuthModal();
        }
    });

    // ========== 9. 暴露全局函数 ==========
    window.openAuthModal = openAuthModal;
    window.loadWebsites = loadWebsites;
    window.switchMainView = switchMainView;
    window.showProfileView = showProfileView;

    // ========== 10. 检查配置并启动 ==========
    if (SUPABASE_CONFIG.url.includes('YOUR_PROJECT')) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1; padding:40px 20px;">
                <div class="empty-icon">⚙️</div>
                <h3>请先配置 Supabase</h3>
                <p>在 <code>script.js</code> 开头的 <code>SUPABASE_CONFIG</code> 中填入你的 Supabase URL 和 anon key</p>
                <p style="font-size:13px;color:var(--gray-400);margin-top:8px;">然后创建 <code>websites</code> 和 <code>profiles</code> 表，并配置 Storage</p>
                <button class="btn btn-outline mt-8" onclick="location.reload()">重新加载</button>
            </div>`;
        return;
    }
    loadSession().catch((err) => { console.error('初始化失败:', err); showToast('初始化失败，请检查控制台', 'error'); });
    subscribeWebsites();
    console.log('⭐ StarSharing 已启动 (含导航标签 + 搜索)');
}

// ===== 裁剪模态框控制 =====
function openCropModal(file) {
    if (!cropModal) return;
    cropFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            cropImage = img;
            resetCropTransform();
            renderCropCanvas();
            cropModal.classList.add('active');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}
function closeCropModal() { if (cropModal) cropModal.classList.remove('active'); cropFile = null; cropImage = null; }
function resetCropTransform() { cropScale = 1; cropOffsetX = 0; cropOffsetY = 0; }
function adjustCropZoom(delta) { if (!cropImage) return; cropScale = Math.min(Math.max(cropScale + delta, 0.5), 3); renderCropCanvas(); }
function renderCropCanvas() {
    if (!cropCanvas || !cropCtx || !cropImage) return;
    const canvas = cropCanvas, ctx = cropCtx;
    const rect = canvas.parentElement.getBoundingClientRect();
    const containerWidth = rect.width || 400, containerHeight = rect.height || 400;
    canvas.width = containerWidth; canvas.height = containerHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const imgAspect = cropImage.width / cropImage.height;
    let drawWidth = canvas.width, drawHeight = canvas.width / imgAspect;
    if (drawHeight < canvas.height) { drawHeight = canvas.height; drawWidth = canvas.height * imgAspect; }
    drawWidth *= cropScale; drawHeight *= cropScale;
    let offsetX = (canvas.width - drawWidth) / 2 + cropOffsetX;
    let offsetY = (canvas.height - drawHeight) / 2 + cropOffsetY;
    ctx.drawImage(cropImage, offsetX, offsetY, drawWidth, drawHeight);
}
function startDrag(e) {
    if (!cropImage) return;
    isDragging = true; dragStartX = e.clientX; dragStartY = e.clientY;
    dragStartOffsetX = cropOffsetX; dragStartOffsetY = cropOffsetY;
    cropCanvas.style.cursor = 'grabbing'; e.preventDefault();
}
function onDrag(e) {
    if (!isDragging) return;
    cropOffsetX = dragStartOffsetX + (e.clientX - dragStartX);
    cropOffsetY = dragStartOffsetY + (e.clientY - dragStartY);
    renderCropCanvas(); e.preventDefault();
}
function endDrag(e) {
    if (isDragging) { isDragging = false; if (cropCanvas) cropCanvas.style.cursor = 'grab'; }
}
function startDragTouch(e) {
    const touch = e.touches[0];
    if (!touch || !cropImage) return;
    isDragging = true; dragStartX = touch.clientX; dragStartY = touch.clientY;
    dragStartOffsetX = cropOffsetX; dragStartOffsetY = cropOffsetY; e.preventDefault();
}
function onDragTouch(e) {
    if (!isDragging) return;
    const touch = e.touches[0]; if (!touch) return;
    cropOffsetX = dragStartOffsetX + (touch.clientX - dragStartX);
    cropOffsetY = dragStartOffsetY + (touch.clientY - dragStartY);
    renderCropCanvas(); e.preventDefault();
}
async function confirmCrop() {
    if (!cropImage || !cropCanvas) return;
    const canvas = cropCanvas;
    const centerX = canvas.width / 2, centerY = canvas.height / 2;
    const radius = Math.min(canvas.width, canvas.height) / 2 * 0.9;
    const cropCanvasTemp = document.createElement('canvas');
    const size = radius * 2;
    cropCanvasTemp.width = size; cropCanvasTemp.height = size;
    const tempCtx = cropCanvasTemp.getContext('2d');
    tempCtx.beginPath(); tempCtx.arc(radius, radius, radius, 0, Math.PI * 2); tempCtx.clip();
    tempCtx.drawImage(canvas, centerX - radius, centerY - radius, size, size, 0, 0, size, size);
    const blob = await new Promise(resolve => cropCanvasTemp.toBlob(resolve, 'image/png'));
    if (!blob) { showToast('裁剪失败', 'error'); return; }
    const file = new File([blob], 'avatar.png', { type: 'image/png' });
    const success = await updateAvatar(file);
    if (success) closeCropModal();
}
// 等待 DOM 加载
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}