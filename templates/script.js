// Data riwayat chat
let chatHistory = JSON.parse(localStorage.getItem('chatHistory')) || [];
let currentChatId = null;

// Simpan riwayat
function saveHistory() {
  localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
}

// Generate ID unik
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Format tanggal untuk grouping
function formatDate(date) {
  const now = new Date();
  const diffTime = Math.abs(now - date);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 1) return "Yesterday";
  if (diffDays <= 7) return "Last week";
  if (diffDays <= 30) return "Last month";
  return "Older";
}

// Render daftar chat di sidebar
function renderChatList() {
  const chatList = document.getElementById('chat-list');
  chatList.innerHTML = '';

  const groupedChats = {};
  chatHistory.forEach(chat => {
    const date = new Date(chat.createdAt);
    const key = formatDate(date);
    if (!groupedChats[key]) groupedChats[key] = [];
    groupedChats[key].push(chat);
  });

  for (const [dateGroup, chats] of Object.entries(groupedChats)) {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'px-3 py-1 text-slate-400 text-sm';
    groupDiv.textContent = dateGroup;
    chatList.appendChild(groupDiv);

    chats.forEach(chat => {
      const item = document.createElement('div');
      item.className = 'p-2 rounded cursor-pointer hover:bg-slate-700 flex justify-between items-center';
      if (chat.id === currentChatId) item.classList.add('bg-slate-700', 'border-l-4', 'border-l-blue-400');

      const title = document.createElement('div');
      title.className = 'truncate max-w-[160px]';
      title.textContent = chat.title || 'Chat Baru';

      const date = document.createElement('div');
      date.className = 'text-xs text-slate-500';
      date.textContent = new Date(chat.createdAt).toLocaleTimeString();

      item.appendChild(title);
      item.appendChild(date);
      item.addEventListener('click', () => loadChat(chat.id));
      chatList.appendChild(item);
    });
  }
}

// Muat chat tertentu
function loadChat(chatId) {
  currentChatId = chatId;
  const chat = chatHistory.find(c => c.id === chatId);
  if (!chat) return;

  document.getElementById('current-chat-title').textContent = chat.title || 'Chat Baru';
  
  const chatBody = document.getElementById('chat-body');
  chatBody.innerHTML = '';
  chat.messages.forEach(msg => {
    addMessage(msg.role, msg.content);
  });
  chatBody.scrollTop = chatBody.scrollHeight;
  renderChatList();
}

// Tambah pesan ke UI
function addMessage(role, content) {
  const div = document.createElement('div');
  div.className = `max-w-[85%] p-3 rounded-2xl ${role === 'user' ? 'bg-blue-100 ml-auto rounded-br-md' : 'bg-gray-100 rounded-bl-md'}`;
  div.innerHTML = content.replace(/\n/g, '<br>');
  document.getElementById('chat-body').appendChild(div);
  document.getElementById('chat-body').scrollTop = document.getElementById('chat-body').scrollHeight;
}

// Buat chat baru
function createNewChat() {
  const newChat = {
    id: generateId(),
    title: 'New Chat',
    createdAt: new Date().toISOString(),
    messages: []
  };
  chatHistory.push(newChat);
  currentChatId = newChat.id;
  saveHistory();
  loadChat(newChat.id);
  renderChatList();
}

// Ganti nama chat
function editChatTitle() {
  const currentChat = chatHistory.find(c => c.id === currentChatId);
  if (!currentChat) return;

  const newTitle = prompt("Ganti nama chat:", currentChat.title);
  if (newTitle !== null && newTitle.trim() !== "") {
    currentChat.title = newTitle.trim();
    document.getElementById('current-chat-title').textContent = newTitle.trim();
    saveHistory();
    renderChatList();
  }
}

// Kirim pesan
async function sendMessage() {
  const text = document.getElementById('message-input').value.trim();
  const file = document.getElementById('file-input').files[0];
  if (!text && !file) return;

  let userMsg = text || '[File dikirim]';
  if (file) userMsg += ` <small class="opacity-70">(📄 ${file.name})</small>`;
  addMessage('user', userMsg);

  addMessage('ai', 'Menganalisis...');

  const formData = new FormData();
  if (text) formData.append('message', text);
  if (file) formData.append('file', file);

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      body: formData
    });
    const data = await response.json();

    const chatBody = document.getElementById('chat-body');
    chatBody.removeChild(chatBody.lastChild);
    addMessage('ai', data.reply);

    const currentChat = chatHistory.find(c => c.id === currentChatId);
    if (currentChat) {
      currentChat.messages.push({ role: 'user', content: userMsg });
      currentChat.messages.push({ role: 'ai', content: data.reply });

      if (currentChat.title === 'New Chat' && text && currentChat.messages.length === 2) {
        const firstWords = text.split(' ').slice(0, 5).join(' ');
        currentChat.title = firstWords + (text.split(' ').length > 5 ? '...' : '');
        document.getElementById('current-chat-title').textContent = currentChat.title;
      }

      saveHistory();
    }

  } catch (err) {
    const chatBody = document.getElementById('chat-body');
    chatBody.removeChild(chatBody.lastChild);
    addMessage('ai', 'Gagal terhubung ke server.');
  }

  document.getElementById('message-input').value = '';
  document.getElementById('file-input').value = '';
}

// Toggle Dark/Light Mode
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  
  // Update ikon
  const btn = document.getElementById('toggle-theme-btn');
  btn.textContent = newTheme === 'dark' ? '☀️' : '🌙';

  // Update background gradient
  document.body.className = newTheme === 'dark'
    ? 'bg-gradient-to-br from-slate-900 to-slate-800 min-h-screen flex overflow-hidden'
    : 'bg-gradient-to-br from-blue-50 to-cyan-100 min-h-screen flex overflow-hidden';
}

// Event listeners
document.getElementById('new-chat-btn').addEventListener('click', createNewChat);
document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('message-input').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});
document.getElementById('file-btn').addEventListener('click', () => {
  document.getElementById('file-input').click();
});
document.getElementById('file-input').addEventListener('change', (e) => {
  if (e.target.files[0]) {
    addMessage('user', `[File: ${e.target.files[0].name}]`);
  }
});
document.getElementById('toggle-theme-btn').addEventListener('click', toggleTheme);
document.getElementById('current-chat-title').addEventListener('click', editChatTitle);

// Inisialisasi
document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  document.getElementById('toggle-theme-btn').textContent = savedTheme === 'dark' ? '☀️' : '🌙';
  document.body.className = savedTheme === 'dark'
    ? 'bg-gradient-to-br from-slate-900 to-slate-800 min-h-screen flex overflow-hidden'
    : 'bg-gradient-to-br from-blue-50 to-cyan-100 min-h-screen flex overflow-hidden';

  if (chatHistory.length === 0) {
    createNewChat();
  } else {
    currentChatId = chatHistory[0].id;
    loadChat(currentChatId);
  }
  renderChatList();
});