const STORAGE_KEY_USER = "pixora_user";
const STORAGE_KEY_POSTS = "pixora_posts";

let currentUser = null;
let posts = [];
let currentFilter = "all";
let currentSearch = "";

/* ----- State Load/Save ----- */
function loadState() {
  const userRaw = localStorage.getItem(STORAGE_KEY_USER);
  const postsRaw = localStorage.getItem(STORAGE_KEY_POSTS);

  if (userRaw) {
    try {
      currentUser = JSON.parse(userRaw);
    } catch {
      currentUser = null;
    }
  }

  if (postsRaw) {
    try {
      posts = JSON.parse(postsRaw);
    } catch {
      posts = [];
    }
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(currentUser));
  localStorage.setItem(STORAGE_KEY_POSTS, JSON.stringify(posts));
}

/* ----- Login / Logout ----- */
function login(username) {
  currentUser = {
    username,
    displayName: username,
    bio: "Just vibing on Pixora.",
  };
  saveState();
  updateUIUser();
  hideLoginOverlay();
  renderFeed();
}

function logout() {
  localStorage.removeItem(STORAGE_KEY_USER);
  currentUser = null;
  showLoginOverlay();
}

function showLoginOverlay() {
  document.getElementById("loginOverlay").style.display = "flex";
}

function hideLoginOverlay() {
  document.getElementById("loginOverlay").style.display = "none";
}

/* ----- UI User Update ----- */
function updateUIUser() {
  if (!currentUser) return;
  const uname = currentUser.username;
  document.getElementById("navbarUsername").innerText = "@" + uname;
  document.getElementById("profileUsername").innerText = "@" + uname;
  document.getElementById("profileDisplayName").innerText =
    currentUser.displayName || uname;
  document.getElementById("profileBio").innerText =
    currentUser.bio || "Just vibing on Pixora.";

  const avatarInitial =
    uname && uname.length > 0 ? uname.charAt(0).toUpperCase() : "P";
  document.getElementById("profileAvatar").innerText = avatarInitial;

  const myPostsCount = posts.filter((p) => p.authorUsername === uname).length;
  document.getElementById("profilePostCount").innerText = myPostsCount;
}

/* ----- Post Operations ----- */
function createPost(imageUrl, caption) {
  if (!currentUser) return;

  const newPost = {
    id: "post_" + Date.now(),
    authorUsername: currentUser.username,
    authorDisplayName: currentUser.displayName || currentUser.username,
    imageUrl,
    caption,
    likes: [],
    comments: [],
    createdAt: Date.now(),
  };
  posts.unshift(newPost);
  saveState();
  updateUIUser();
  renderFeed();
}

function toggleLike(postId) {
  if (!currentUser) return;
  const post = posts.find((p) => p.id === postId);
  if (!post) return;

  const idx = post.likes.indexOf(currentUser.username);
  if (idx === -1) {
    post.likes.push(currentUser.username);
  } else {
    post.likes.splice(idx, 1);
  }
  saveState();
  renderFeed();
}

function addComment(postId, text) {
  if (!currentUser) return;
  if (!text.trim()) return;
  const post = posts.find((p) => p.id === postId);
  if (!post) return;

  post.comments.push({
    id: "c_" + Date.now() + "_" + Math.random().toString(16).slice(2),
    authorUsername: currentUser.username,
    text: text.trim(),
    createdAt: Date.now(),
  });
  saveState();
  renderFeed();
}

function deletePost(postId) {
  if (!currentUser) return;
  const post = posts.find((p) => p.id === postId);
  if (!post) return;
  if (post.authorUsername !== currentUser.username) return;

  posts = posts.filter((p) => p.id !== postId);
  saveState();
  updateUIUser();
  renderFeed();
}

/* ----- Helpers ----- */
function formatTimeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return sec + "s ago";
  const min = Math.floor(sec / 60);
  if (min < 60) return min + "m ago";
  const hour = Math.floor(min / 60);
  if (hour < 24) return hour + "h ago";
  const day = Math.floor(hour / 24);
  if (day < 7) return day + "d ago";
  const date = new Date(timestamp);
  return date.toLocaleDateString();
}

/* ----- Render Feed ----- */
function renderFeed() {
  const feedEl = document.getElementById("feed");
  if (!feedEl) return;

  let visiblePosts = [...posts];

  if (currentFilter === "mine" && currentUser) {
    visiblePosts = visiblePosts.filter(
      (p) => p.authorUsername === currentUser.username
    );
  }

  if (currentSearch.trim() !== "") {
    const q = currentSearch.trim().toLowerCase();
    visiblePosts = visiblePosts.filter((p) =>
      p.caption.toLowerCase().includes(q)
    );
  }

  if (visiblePosts.length === 0) {
    feedEl.innerHTML =
      '<div class="feed-empty">No posts yet. Be the first to share something ✨</div>';
    return;
  }

  let html = "";
  for (const post of visiblePosts) {
    const isLiked =
      currentUser && post.likes.includes(currentUser.username);
    const likeCount = post.likes.length;
    const commentCount = post.comments.length;

    html += `
      <article class="post">
        <div class="post-header">
          <div class="avatar">${post.authorUsername
            .charAt(0)
            .toUpperCase()}</div>
          <div class="post-user-info">
            <div class="post-username">${post.authorDisplayName}</div>
            <div class="post-meta">@${post.authorUsername} • ${formatTimeAgo(
              post.createdAt
            )}</div>
          </div>
          ${
            currentUser && post.authorUsername === currentUser.username
              ? `<button class="danger-link" data-action="delete-post" data-post-id="${post.id}">Delete</button>`
              : ""
          }
        </div>
        <div class="post-image-wrapper">
          <img src="${post.imageUrl}" alt="Post image" class="post-image"
            onerror="this.src='https://via.placeholder.com/800x600/020617/ffffff?text=Image+not+found';" />
        </div>
        <div class="post-body">
          <div class="post-caption"><strong>@${post.authorUsername}</strong> ${post.caption}</div>
        </div>
        <div class="post-actions">
          <div class="post-actions-left">
            <button class="icon-btn" data-action="toggle-like" data-post-id="${post.id}" title="Like">
              <span class="icon-heart">${isLiked ? "❤️" : "🤍"}</span>
            </button>
            <span>${likeCount} like${likeCount === 1 ? "" : "s"}</span>
            <span>•</span>
            <span>${commentCount} comment${commentCount === 1 ? "" : "s"}</span>
          </div>
          <div class="post-actions-right">
            <span>${new Date(post.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}</span>
          </div>
        </div>
        <div class="post-comments">
          ${post.comments
            .map(
              (c) => `
            <div class="comment">
              <span>@${c.authorUsername}</span>${c.text}
            </div>
          `
            )
            .join("")}
          <form class="comment-form" data-post-id="${post.id}">
            <input type="text" placeholder="Add a comment..." />
            <button type="submit" class="btn small-btn">Post</button>
          </form>
        </div>
      </article>
    `;
  }

  feedEl.innerHTML = html;
}

/* ----- Event Listeners ----- */
function attachEventListeners() {
  const loginBtn = document.getElementById("loginBtn");
  const loginInput = document.getElementById("loginUsername");
  const logoutBtn = document.getElementById("logoutBtn");

  loginBtn.addEventListener("click", () => {
    const uname = loginInput.value.trim();
    if (uname.length < 3) {
      alert("Username must be at least 3 characters.");
      return;
    }
    login(uname);
  });

  loginInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      loginBtn.click();
    }
  });

  logoutBtn.addEventListener("click", () => {
    if (confirm("Clear your Pixora session?")) {
      logout();
      window.location.reload();
    }
  });

  const newPostForm = document.getElementById("newPostForm");
  newPostForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!currentUser) {
      alert("Please log in first.");
      return;
    }
    const imgUrl = document.getElementById("imageUrl").value.trim();
    const caption = document.getElementById("caption").value.trim();
    if (!imgUrl || !caption) return;
    createPost(imgUrl, caption);
    newPostForm.reset();
  });

  const filterAllBtn = document.getElementById("filterAll");
  const filterMineBtn = document.getElementById("filterMine");

  filterAllBtn.addEventListener("click", () => {
    currentFilter = "all";
    filterAllBtn.classList.add("chip-active");
    filterMineBtn.classList.remove("chip-active");
    renderFeed();
  });

  filterMineBtn.addEventListener("click", () => {
    currentFilter = "mine";
    filterMineBtn.classList.add("chip-active");
    filterAllBtn.classList.remove("chip-active");
    renderFeed();
  });

  const searchInput = document.getElementById("searchInput");
  searchInput.addEventListener("input", (e) => {
    currentSearch = e.target.value;
    renderFeed();
  });

  document.getElementById("feed").addEventListener("click", function (e) {
    const target = e.target;
    const action = target.getAttribute("data-action");
    const postId = target.getAttribute("data-post-id");

    if (!action && target.parentElement) {
      const parent = target.parentElement;
      const pAction = parent.getAttribute("data-action");
      const pPostId = parent.getAttribute("data-post-id");
      if (pAction && pPostId) {
        if (pAction === "toggle-like") toggleLike(pPostId);
        else if (pAction === "delete-post") {
          if (confirm("Delete this post?")) deletePost(pPostId);
        }
      }
      return;
    }

    if (!action || !postId) return;
    if (action === "toggle-like") {
      toggleLike(postId);
    } else if (action === "delete-post") {
      if (confirm("Delete this post?")) deletePost(postId);
    }
  });

  document.getElementById("feed").addEventListener("submit", function (e) {
    if (e.target && e.target.matches("form.comment-form")) {
      e.preventDefault();
      const form = e.target;
      const postId = form.getAttribute("data-post-id");
      const input = form.querySelector("input");
      const text = input.value.trim();
      if (text) {
        addComment(postId, text);
        input.value = "";
      }
    }
  });
}

/* ----- Init ----- */
(function init() {
  loadState();
  attachEventListeners();

  if (!currentUser) {
    showLoginOverlay();
  } else {
    hideLoginOverlay();
    updateUIUser();
    renderFeed();
  }
})();
