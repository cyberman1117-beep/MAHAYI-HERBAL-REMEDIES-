const searchPanel = document.querySelector('[data-search-panel]');
const searchToggle = document.querySelector('[data-search-toggle]');
const searchClose = document.querySelector('[data-search-close]');

const setSearchOpen = (isOpen) => {
  if (!searchPanel) return;
  searchPanel.hidden = !isOpen;
  if (isOpen) document.querySelector('#site-search')?.focus();
};

searchToggle?.addEventListener('click', () => setSearchOpen(true));
searchClose?.addEventListener('click', () => setSearchOpen(false));

document.querySelectorAll('[data-current-year]').forEach((element) => {
  element.textContent = new Date().getFullYear();
});

const sentinel = document.querySelector('[data-catalogue-sentinel]');
if (sentinel && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) sentinel.classList.add('is-ready');
  }, { rootMargin: '240px' });
  observer.observe(sentinel);
}

const publicSettingsCacheKey = 'clothing-store-public-settings';

const socialIconNames = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  whatsapp: 'WhatsApp'
};

const socialIconColors = {
  facebook: '#1877F2',
  instagram: '#E4405F',
  tiktok: '#111111',
  youtube: '#FF0000',
  whatsapp: '#25D366'
};

const applyPublicStoreSettings = (store = {}, socialLinks = []) => {
  const storeNameElements = document.querySelectorAll('[data-store-name]');
  const logoElements = document.querySelectorAll('[data-store-logo]');
  const favicon = document.querySelector('[data-store-favicon]');
  const taglineElements = document.querySelectorAll('[data-store-tagline]');
  const heroHeadlineElements = document.querySelectorAll('[data-store-hero-headline]');
  const descriptionElements = document.querySelectorAll('[data-store-description]');
  const secondaryDescriptionElements = document.querySelectorAll('[data-store-description-secondary]');
  const metaDescription = document.querySelector('[data-store-meta-description]');
  const socialLinkContainers = document.querySelectorAll('[data-social-links]');

  if (store.logo_url) {
    logoElements.forEach((element) => { element.src = store.logo_url; element.hidden = false; });
    if (favicon) favicon.href = store.logo_url;
  } else {
    logoElements.forEach((element) => { element.hidden = true; });
    if (favicon) favicon.removeAttribute('href');
  }

  if (store.store_name) {
    storeNameElements.forEach((element) => {
      element.textContent = store.store_name;
    });
    document.title = `${store.store_name} | Make your mark`;
  }

  if (store.tagline) {
    taglineElements.forEach((element) => {
      element.textContent = store.tagline;
    });
  }

  if (store.additional_settings?.hero_headline) {
    heroHeadlineElements.forEach((element) => {
      element.textContent = store.additional_settings.hero_headline;
    });
  }

  if (store.description) {
    descriptionElements.forEach((element) => {
      element.textContent = store.description;
    });
    secondaryDescriptionElements.forEach((element) => {
      element.textContent = store.description;
    });
    if (metaDescription) metaDescription.setAttribute('content', store.description);
  }

  if (socialLinkContainers.length) {
    const links = Array.isArray(socialLinks) ? socialLinks.filter((link) => link?.url && socialIconNames[link.platform]) : [];
    socialLinkContainers.forEach((container) => {
      container.innerHTML = links.map((link) => {
        const platform = String(link.platform);
        const label = String(link.label || socialIconNames[platform]);
        const url = String(link.url || '');
        const iconColor = socialIconColors[platform];
        const iconUrl = `https://cdn.simpleicons.org/${platform}/${encodeURIComponent(iconColor)}`;
        return `<a href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeAttribute(label)}" title="${escapeAttribute(label)}" style="display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;margin:0 .35rem .35rem 0;border-radius:50%;background:${iconColor};vertical-align:middle;transition:transform .2s ease,opacity .2s ease;"><img src="${iconUrl}" alt="" width="22" height="22" loading="lazy" decoding="async" style="display:block;width:22px;height:22px;filter:brightness(0) invert(1);" onerror="this.style.display='none'"></a>`;
      }).join('');
    });
  }
};

const readCachedPublicStoreSettings = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(publicSettingsCacheKey) || 'null');
    if (cached?.store) applyPublicStoreSettings(cached.store, cached.social_links || []);
  } catch {
    // Ignore unavailable or invalid local cache.
  }
};

const loadPublicStoreSettings = async () => {
  const hasPublicSettingsElements = document.querySelector('[data-store-name], [data-store-tagline], [data-store-hero-headline], [data-store-description], [data-store-description-secondary], [data-social-links]');
  if (!hasPublicSettingsElements) return;

  readCachedPublicStoreSettings();

  try {
    const response = await fetch('/api/store-settings', {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
    if (!response.ok) throw new Error('Settings request failed');
    const payload = await response.json();
    const store = payload?.data?.store || {};
    const socialLinks = payload?.data?.social_links || [];

    applyPublicStoreSettings(store, socialLinks);

    try {
      localStorage.setItem(publicSettingsCacheKey, JSON.stringify({ store, social_links: socialLinks }));
    } catch {
      // Continue normally if browser storage is unavailable.
    }
  } catch {
    // Keep cached or existing storefront copy if the public settings API is unavailable.
  }
};

loadPublicStoreSettings();

const settingsForm = document.querySelector('[data-settings-form]');
const socialList = document.querySelector('[data-social-list]');
const settingsStatus = document.querySelector('[data-settings-status]');
const logoFileInput = settingsForm?.elements.namedItem('logo_file');
const logoUrlField = settingsForm?.elements.namedItem('logo_url');
const logoPreview = document.querySelector('[data-store-logo-preview]');
const logoPreviewImage = document.querySelector('[data-store-logo-preview-image]');
const removeLogoButton = document.querySelector('[data-remove-logo]');
const supportedPlatforms = [
  { platform: 'facebook', label: 'Facebook' },
  { platform: 'instagram', label: 'Instagram' },
  { platform: 'tiktok', label: 'TikTok' },
  { platform: 'youtube', label: 'YouTube' },
  { platform: 'whatsapp', label: 'WhatsApp' }
];

const setSettingsStatus = (message) => {
  if (settingsStatus) settingsStatus.textContent = message;
};

const escapeAttribute = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));

const renderSocialLinks = (links = []) => {
  if (!socialList) return;
  const configured = new Map(links.map((link) => [link.platform, link]));
  socialList.innerHTML = supportedPlatforms.map(({ platform, label }) => {
    const link = configured.get(platform) || {};
    return `<div class="social-row" data-platform="${platform}">
      <label class="social-toggle"><input type="checkbox" name="social_enabled_${platform}" ${Number(link.is_enabled) === 1 ? 'checked' : ''}><span class="toggle-box" aria-hidden="true"></span><span>${label}</span></label>
      <input name="social_label_${platform}" type="text" value="${escapeAttribute(link.label || label)}" placeholder="Display label" aria-label="${label} display label">
      <input name="social_url_${platform}" type="url" value="${escapeAttribute(link.url || '')}" placeholder="https://..." aria-label="${label} URL">
      <input name="social_order_${platform}" class="social-order" type="number" min="0" value="${Number.isFinite(Number(link.sort_order)) ? Number(link.sort_order) : 0}" aria-label="${label} display order">
    </div>`;
  }).join('');
};

const updateLogoPreview = (url) => {
  if (!logoPreview || !logoPreviewImage) return;
  if (url) { logoPreviewImage.src = url; logoPreview.hidden = false; }
  else { logoPreviewImage.removeAttribute('src'); logoPreview.hidden = true; }
};

const populateSettings = (store = {}) => {
  if (!settingsForm) return;
  ['store_name', 'logo_url', 'tagline', 'description', 'contact_email', 'contact_phone', 'whatsapp_url', 'address'].forEach((name) => {
    const field = settingsForm.elements.namedItem(name);
    if (field) field.value = store[name] || '';
  });
  updateLogoPreview(store.logo_url || '');
  if (logoFileInput) logoFileInput.value = '';
  const heroHeadlineField = settingsForm.elements.namedItem('hero_headline');
  if (heroHeadlineField) heroHeadlineField.value = store.additional_settings?.hero_headline || '';
  const email = store.additional_settings?.email || {};
  const emailFields = {
    email_enabled: Boolean(email.enabled),
    email_provider: email.provider || 'resend',
    email_sender_name: email.sender_name || '',
    email_sender_email: email.sender_email || '',
    email_reply_to: email.reply_to || '',
    email_notify_order_confirmation: email.notify_order_confirmation !== false,
    email_notify_order_status: email.notify_order_status !== false,
    email_notify_new_chat: email.notify_new_chat !== false
  };
  Object.entries(emailFields).forEach(([name, value]) => {
    const field = settingsForm.elements.namedItem(name);
    if (!field) return;
    if (field.type === 'checkbox') field.checked = Boolean(value);
    else field.value = value;
  });
};

const collectSettings = () => {
  const data = {};
  ['store_name', 'logo_url', 'tagline', 'description', 'contact_email', 'contact_phone', 'whatsapp_url', 'address'].forEach((name) => {
    data[name] = String(settingsForm.elements.namedItem(name)?.value || '').trim();
  });
  data.hero_headline = String(settingsForm.elements.namedItem('hero_headline')?.value || '').trim();
  data.email_notifications = {
    enabled: Boolean(settingsForm.elements.namedItem('email_enabled')?.checked),
    provider: String(settingsForm.elements.namedItem('email_provider')?.value || 'resend').trim(),
    sender_name: String(settingsForm.elements.namedItem('email_sender_name')?.value || '').trim(),
    sender_email: String(settingsForm.elements.namedItem('email_sender_email')?.value || '').trim(),
    reply_to: String(settingsForm.elements.namedItem('email_reply_to')?.value || '').trim(),
    notify_order_confirmation: Boolean(settingsForm.elements.namedItem('email_notify_order_confirmation')?.checked),
    notify_order_status: Boolean(settingsForm.elements.namedItem('email_notify_order_status')?.checked),
    notify_new_chat: Boolean(settingsForm.elements.namedItem('email_notify_new_chat')?.checked)
  };
  data.social_links = supportedPlatforms.map(({ platform }) => ({
    platform,
    label: String(settingsForm.elements.namedItem(`social_label_${platform}`)?.value || '').trim(),
    url: String(settingsForm.elements.namedItem(`social_url_${platform}`)?.value || '').trim(),
    sort_order: Number(settingsForm.elements.namedItem(`social_order_${platform}`)?.value || 0),
    is_enabled: Boolean(settingsForm.elements.namedItem(`social_enabled_${platform}`)?.checked)
  }));
  return data;
};

if (settingsForm) {
  const saveButton = settingsForm.querySelector('button[type="submit"]');
  renderSocialLinks();
  fetch('/api/store-settings', { headers: { Accept: 'application/json' } })
    .then((response) => {
      if (!response.ok) throw new Error('Settings request failed');
      return response.json();
    })
    .then((payload) => {
      populateSettings(payload.data?.store || {});
      renderSocialLinks(payload.data?.social_links || []);
      if (saveButton) saveButton.disabled = false;
      setSettingsStatus('Current settings loaded. Changes are ready to save.');
    })
    .catch(() => setSettingsStatus('Unable to load settings. Check the API connection and try again.'));

  logoFileInput?.addEventListener('change', () => {
    const file = logoFileInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setSettingsStatus('Please choose an image file.'); logoFileInput.value = ''; return; }
    if (file.size > 10 * 1024 * 1024) { setSettingsStatus('Logo is too large. Maximum size is 10 MB.'); logoFileInput.value = ''; return; }
    updateLogoPreview(URL.createObjectURL(file));
  });

  removeLogoButton?.addEventListener('click', () => {
    if (logoUrlField) logoUrlField.value = '';
    if (logoFileInput) logoFileInput.value = '';
    updateLogoPreview('');
  });

  settingsForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!window.getAdminIdToken) {
      setSettingsStatus('Your admin session is not ready. Please sign in again.');
      return;
    }

    const confirmed = window.confirm('Are you sure you want to update the store settings?');
    if (!confirmed) return;

    if (saveButton) saveButton.disabled = true;
    setSettingsStatus('Saving changes…');

    try {
      const idToken = await window.getAdminIdToken();
      const logoFile = logoFileInput?.files?.[0];
      if (logoFile) {
        setSettingsStatus('Uploading store logo…');
        const uploadForm = new FormData();
        uploadForm.append('file', logoFile, logoFile.name);
        uploadForm.append('purpose', 'logo');
        const uploadResponse = await fetch('/api/upload-image', { method: 'POST', headers: { Authorization: `Bearer ${idToken}`, Accept: 'application/json' }, body: uploadForm });
        const uploadPayload = await uploadResponse.json().catch(() => ({}));
        if (!uploadResponse.ok || !uploadPayload?.success) throw new Error(uploadPayload?.error || 'Logo upload failed');
        if (logoUrlField) logoUrlField.value = uploadPayload.data.image_url;
      }
      const response = await fetch('/api/store-settings', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(collectSettings())
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error || 'Save failed');
      setSettingsStatus('Settings saved successfully.');
    } catch (error) {
      setSettingsStatus(error?.message === 'Authentication required.' ? 'Your admin session has expired. Please sign in again.' : 'Unable to save settings. Please try again.');
    } finally {
      if (saveButton) saveButton.disabled = false;
    }
  });
}

if (window.location.pathname.endsWith('/checkout.html')) {
  const liveCourierScript = document.createElement('script');
  liveCourierScript.src = '/assets/js/live-courier-checkout.js';
  liveCourierScript.defer = true;
  document.head.appendChild(liveCourierScript);
}


/* Customer sticky live chat */
const initCustomerStickyChat = async () => {
  if (document.body.classList.contains('admin-page') || document.querySelector('[data-customer-sticky-chat]')) return;

  const root = document.createElement('div');
  root.dataset.customerStickyChat = '';
  root.innerHTML = `
    <button class="customer-sticky-chat-button" type="button" data-chat-open aria-expanded="false" aria-controls="customer-sticky-chat-panel">
      <span aria-hidden="true">💬</span><span>Chat with us</span>
    </button>
    <div class="customer-sticky-chat-backdrop" data-chat-backdrop hidden></div>
    <aside class="customer-sticky-chat-panel" id="customer-sticky-chat-panel" data-chat-panel aria-hidden="true">
      <div class="customer-sticky-chat-header">
        <div><p class="eyebrow">Customer care</p><h2>Live Chat</h2><p class="muted" data-chat-status>Loading…</p></div>
        <button class="button button-outline button-small" type="button" data-chat-close>Close</button>
      </div>
      <div class="customer-sticky-chat-content" data-chat-content></div>
    </aside>
  `;
  document.body.appendChild(root);

  const openButton = root.querySelector('[data-chat-open]');
  const closeButton = root.querySelector('[data-chat-close]');
  const backdrop = root.querySelector('[data-chat-backdrop]');
  const panel = root.querySelector('[data-chat-panel]');
  const content = root.querySelector('[data-chat-content]');
  const status = root.querySelector('[data-chat-status]');
  let user = null;
  let conversationId = null;
  let refreshTimer = null;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[character]));

  const api = async (url, options = {}) => {
    if (!user) throw new Error('Please sign in to use live chat.');
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', 'Bearer ' + await user.getIdToken());
    if (options.body) headers.set('Content-Type', 'application/json');
    const response = await fetch(url, { ...options, headers, cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.error || 'Unable to load live chat.');
    return data;
  };

  const setOpen = (open) => {
    panel.classList.toggle('is-open', open);
    backdrop.hidden = !open;
    backdrop.classList.toggle('is-visible', open);
    panel.setAttribute('aria-hidden', String(!open));
    openButton.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('customer-sticky-chat-open', open);
    if (!open) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  };

  const signInView = () => {
    status.textContent = 'Customer care';
    content.innerHTML = `
      <div class="customer-sticky-chat-empty">
        <h3>Sign in to chat with us</h3>
        <p class="muted">Your conversations are saved to your customer account so you can continue them later.</p>
        <a class="button button-primary" href="/account.html">Sign in / Create account</a>
      </div>`;
  };

  const renderList = async () => {
    const data = await api('/api/customer-communications');
    const conversations = Array.isArray(data.data) ? data.data : [];
    status.textContent = conversations.length ? conversations.length + ' conversation' + (conversations.length === 1 ? '' : 's') : 'Customer care';
    content.innerHTML = `
      <div class="customer-sticky-chat-actions"><button class="button button-primary" type="button" data-chat-new>New chat</button></div>
      <div class="customer-sticky-chat-list">
        ${conversations.length ? conversations.map((conversation) => `
          <button class="customer-sticky-chat-conversation" type="button" data-chat-conversation="${conversation.id}">
            <strong>Ticket #${esc(conversation.id)}</strong>
            <span>${esc(conversation.subject || 'Customer question')}</span>
            <small>${esc(conversation.message_count + ' message' + (conversation.message_count === 1 ? '' : 's'))} · ${esc(conversation.status)}</small>
          </button>`).join('') : '<p class="muted">No conversations yet. Start a chat and our customer care team will reply here.</p>'}
      </div>`;
    content.querySelector('[data-chat-new]')?.addEventListener('click', renderNew);
    content.querySelectorAll('[data-chat-conversation]').forEach((button) => {
      button.addEventListener('click', () => renderConversation(Number(button.dataset.chatConversation)));
    });
  };

  const renderNew = () => {
    status.textContent = 'New conversation';
    content.innerHTML = `
      <form class="customer-sticky-chat-form" data-chat-new-form>
        <label class="field"><span>Message</span><textarea name="body" rows="6" maxlength="4000" required placeholder="How can we help?"></textarea></label>
        <div class="settings-actions"><span class="settings-load-status" data-chat-form-status>Ready.</span><button class="button button-primary" type="submit">Send message</button></div>
      </form>`;
    content.querySelector('textarea')?.focus();
    content.querySelector('[data-chat-new-form]').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const formStatus = form.querySelector('[data-chat-form-status]');
      formStatus.textContent = 'Sending…';
      try {
        const result = await api('/api/customer-communications', {
          method: 'POST',
          body: JSON.stringify({ body: form.elements.body.value.trim() })
        });
        conversationId = Number(result.data.id);
        await renderConversation(conversationId);
      } catch (error) {
        formStatus.textContent = error.message;
      }
    });
  };

  const renderConversation = async (id) => {
    conversationId = id;
    const data = await api('/api/customer-communications?id=' + encodeURIComponent(id));
    const conversation = data.data;
    const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
    status.textContent = 'Ticket #' + conversation.id + ' · ' + conversation.status;
    content.innerHTML = `
      <div class="customer-sticky-chat-conversation-toolbar">
        <button class="button button-outline button-small" type="button" data-chat-back>← Conversations</button>
      </div>
      <div class="customer-sticky-chat-messages" data-chat-messages>
        ${messages.map((message) => `
          <article class="customer-sticky-chat-message ${message.sender_type === 'customer' ? 'is-customer' : 'is-admin'}">
            <strong>${esc(message.sender_type === 'customer' ? 'You' : (message.sender_name || 'Customer care'))}</strong>
            <p>${esc(message.body)}</p>
          </article>`).join('')}
      </div>
      ${conversation.status === 'open'
        ? `<form class="customer-sticky-chat-form" data-chat-reply>
             <textarea name="body" rows="3" maxlength="4000" required placeholder="Write a reply…"></textarea>
             <div class="settings-actions"><span class="settings-load-status" data-chat-reply-status>Replies appear here.</span><button class="button button-primary" type="submit">Send</button></div>
           </form>`
        : '<p class="settings-notice">This conversation is closed.</p>'}`;
    content.querySelector('[data-chat-messages]')?.scrollTo({ top: content.querySelector('[data-chat-messages]').scrollHeight });
    content.querySelector('[data-chat-back]')?.addEventListener('click', renderList);
    content.querySelector('[data-chat-reply]')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const formStatus = form.querySelector('[data-chat-reply-status]');
      formStatus.textContent = 'Sending…';
      try {
        await api('/api/customer-communications', {
          method: 'POST',
          body: JSON.stringify({ conversation_id: conversationId, body: form.elements.body.value.trim() })
        });
        form.reset();
        await renderConversation(conversationId);
      } catch (error) {
        formStatus.textContent = error.message;
      }
    });
  };

  const refreshOpenConversation = async () => {
    if (!panel.classList.contains('is-open') || !conversationId || !user) return;
    try { await renderConversation(conversationId); } catch { /* Keep the current conversation visible. */ }
    refreshTimer = setTimeout(refreshOpenConversation, 5000);
  };

  openButton.addEventListener('click', async () => {
    setOpen(true);
    if (!user) {
      signInView();
      return;
    }
    try {
      conversationId = null;
      await renderList();
    } catch (error) {
      status.textContent = 'Customer care';
      content.innerHTML = '<p class="settings-notice">' + esc(error.message) + '</p>';
    }
  });
  closeButton.addEventListener('click', () => setOpen(false));
  backdrop.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && panel.classList.contains('is-open')) setOpen(false);
  });

  try {
    const [{ initializeApp, getApps }, { firebaseConfig }, { getAuth, onAuthStateChanged }] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
      import('/assets/js/firebase-config.js'),
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js')
    ]);
    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    const auth = getAuth(app);
    onAuthStateChanged(auth, (currentUser) => {
      user = currentUser;
      if (!user && panel.classList.contains('is-open')) signInView();
    });
  } catch {
    status.textContent = 'Customer care';
    content.innerHTML = '<p class="settings-notice">Live chat is temporarily unavailable.</p>';
  }

  return root;
};

initCustomerStickyChat();


const informationLinkContainers = document.querySelectorAll("[data-information-links]");
const loadPublicInformationLinks = async () => {
  if (!informationLinkContainers.length) return;
  try {
    const response = await fetch("/api/content-pages", { headers: { Accept: "application/json" }, cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) return;
    const pages = Array.isArray(payload.data) ? payload.data : [];
    informationLinkContainers.forEach((container) => {
      container.innerHTML = pages.map((page) =>
        '<a href="information.html?slug=' + encodeURIComponent(page.slug) + '">' +
        escapeAttribute(page.title || page.slug) + '</a>'
      ).join("");
    });
  } catch {
    // Keep existing footer links if the information API is unavailable.
  }
};
loadPublicInformationLinks();
