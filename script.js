// ================================================================
// 1. 配置 ——— 请替换为你的 Supabase 项目信息
// ================================================================
const SUPABASE_CONFIG = {
    url: 'https://mqqkvolvljixdztvrrfw.supabase.co', // 替换为你的 Supabase URL
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xcWt2b2x2bGppeGR6dHZycmZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyOTEzODAsImV4cCI6MjEwMDg2NzM4MH0.RBH9KghNTYtnteVDvei7xYz3K2AsU6R7QLVbx9nofcU', // 替换为你的 supabaselient anon key
};

// ================================================================
// 2. 初始化 Supabase 客户端
// ================================================================
const supabaseClient = window.supabase.createClient(
    SUPABASE_CONFIG.url,
    SUPABASE_CONFIG.anonKey
);

// ================================================================
// 3. DOM 引用 (在 DOM 加载完成后赋值)
// ================================================================
let $, $$, navActions, grid, statsCount, fabAdd;
let authModal, authModalClose, authTabs, tabLogin, tabRegister;
let loginForm, registerForm, loginEmail, loginPassword;
let registerUsername, registerEmail, registerPassword, loginError, registerError;
let addModal, addModalClose, addModalCancel, addForm;
let addTitle, addUrl, addDesc, addCategory, addError;
let toastContainer;

// ================================================================
// 4. 工具函数
// ================================================================
function showToast(message, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    toastContainer.appendChild(el);
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

// ================================================================
// 5. 认证状态管理
// ================================================================
let currentUser = null;

async function loadSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
        console.warn('获取 session 失败:', error);
        return;
    }
    currentUser = data?.session?.user || null;
    updateUI();
    if (currentUser) {
        await loadWebsites();
    } else {
        await loadWebsites();
    }
}

supabaseClient.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user || null;
    updateUI();
    if (currentUser) {
        loadWebsites();
        showToast('👋 登录成功！', 'success');
    } else {
        if (event === 'SIGNED_OUT') {
            showToast('已退出', 'info');
        }
        loadWebsites();
    }
});

// ================================================================
// 6. UI 更新
// ================================================================
function updateUI() {
    const isLoggedIn = !!currentUser;

    if (isLoggedIn) {
        const email = currentUser.email || '';
        const initial = getInitials(email);
        navActions.innerHTML = `
            <div class="user-info">
                <span class="avatar">${initial}</span>
                <span>${email}</span>
            </div>
            <button class="btn btn-outline btn-sm" id="logoutBtn">退出</button>
        `;
        document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
    } else {
        navActions.innerHTML = `
            <button class="btn btn-outline btn-sm" id="loginBtn">登录</button>
            <button class="btn btn-primary btn-sm" id="registerBtn">注册</button>
        `;
        document.getElementById('loginBtn')?.addEventListener('click', () => openAuthModal('login'));
        document.getElementById('registerBtn')?.addEventListener('click', () => openAuthModal('register'));
    }

    fabAdd.classList.toggle('hidden', !isLoggedIn);
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
// 8. 模态框控制
// ================================================================
function openAuthModal(tab = 'login') {
    authModal.classList.add('active');
    switchTab(tab);
    loginError.classList.remove('show');
    registerError.classList.remove('show');
    loginForm.reset();
    registerForm.reset();
}

function closeAuthModal() {
    authModal.classList.remove('active');
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
// 9. 数据操作 — 网站
// ================================================================
async function loadWebsites() {
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
// 10. 实时订阅 (Realtime)
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
// 11. 初始化 DOM 引用 & 绑定事件
// ================================================================
function initApp() {
    // 获取 DOM 元素
    $ = (sel) => document.querySelector(sel);
    $$ = (sel) => document.querySelectorAll(sel);

    navActions = $('#navActions');
    grid = $('#websiteGrid');
    statsCount = $('#statsCount');
    fabAdd = $('#fabAdd');

    authModal = $('#authModal');
    authModalClose = $('#authModalClose');
    authTabs = $('#authTabs');
    tabLogin = $('#tabLogin');
    tabRegister = $('#tabRegister');
    loginForm = $('#loginForm');
    registerForm = $('#registerForm');
    loginEmail = $('#loginEmail');
    loginPassword = $('#loginPassword');
    registerUsername = $('#registerUsername');
    registerEmail = $('#registerEmail');
    registerPassword = $('#registerPassword');
    loginError = $('#loginError');
    registerError = $('#registerError');

    addModal = $('#addModal');
    addModalClose = $('#addModalClose');
    addModalCancel = $('#addModalCancel');
    addForm = $('#addForm');
    addTitle = $('#addTitle');
    addUrl = $('#addUrl');
    addDesc = $('#addDesc');
    addCategory = $('#addCategory');
    addError = $('#addError');

    toastContainer = $('#toastContainer');

    // 绑定事件
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

    // 暴露全局函数供 HTML 内联调用
    window.openAddModal = openAddModal;
    window.openAuthModal = openAuthModal;
    window.loadWebsites = loadWebsites;

    // 启动应用
    if (SUPABASE_CONFIG.url.includes('YOUR_PROJECT')) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1; padding:40px 20px;">
                <div class="empty-icon">⚙️</div>
                <h3>请先配置 Supabase</h3>
                <p>在 <code>script.js</code> 开头的 <code>SUPABASE_CONFIG</code> 中填入你的 Supabase URL 和 anon key</p>
                <p style="font-size:13px;color:var(--gray-400);margin-top:8px;">
                    然后创建 <code>websites</code> 表，并启用 RLS（参考 README）
                </p>
                <button class="btn btn-outline mt-8" onclick="location.reload()">重新加载</button>
            </div>
        `;
    } else {
        loadSession().catch((err) => {
            console.error('初始化失败:', err);
            showToast('初始化失败，请检查控制台', 'error');
        });
        subscribeWebsites();
    }

    console.log('🔗 LinkShare 已启动 (分离模式)');
    console.log('📌 使用 Supabase 作为后端');
}

// 等待 DOM 加载完成后启动
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}