// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "super_secret_pixora_key_change_me";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/pixora";

// ----- MongoDB Connection -----
mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// ----- Schemas & Models -----
const { Schema, model, Types } = mongoose;

const userSchema = new Schema(
  {
    username: { type: String, unique: true, required: true },
    passwordHash: { type: String, required: true },
    displayName: { type: String, required: true },
    bio: { type: String, default: "Just vibing on Pixora." },
    avatarUrl: { type: String, default: null },
  },
  { timestamps: true }
);

const postSchema = new Schema(
  {
    author: { type: Schema.Types.ObjectId, ref: "User", required: true },
    imageUrl: { type: String, required: true },
    caption: { type: String, required: true },
  },
  { timestamps: true }
);

const likeSchema = new Schema(
  {
    post: { type: Schema.Types.ObjectId, ref: "Post", required: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);
likeSchema.index({ post: 1, user: 1 }, { unique: true });

const commentSchema = new Schema(
  {
    post: { type: Schema.Types.ObjectId, ref: "Post", required: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true },
  },
  { timestamps: true }
);

const User = model("User", userSchema);
const Post = model("Post", postSchema);
const Like = model("Like", likeSchema);
const Comment = model("Comment", commentSchema);

// ----- Middleware -----
app.use(cors());
app.use(express.json());

// Auth middleware
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) return res.status(401).json({ error: "No token provided" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ error: "Invalid token user" });
    req.user = user;
    next();
  } catch (err) {
    console.error("JWT error:", err.message);
    return res.status(401).json({ error: "Invalid token" });
  }
}

// Helper: build post DTO list efficiently
async function buildPostDtos(posts, currentUserId) {
  const postIds = posts.map((p) => p._id);
  if (postIds.length === 0) return [];

  const likes = await Like.find({ post: { $in: postIds } }).lean();
  const comments = await Comment.find({ post: { $in: postIds } })
    .populate("user", "username displayName")
    .lean();

  const likesByPost = {};
  const commentsByPost = {};

  for (const l of likes) {
    const key = l.post.toString();
    if (!likesByPost[key]) likesByPost[key] = [];
    likesByPost[key].push(l);
  }

  for (const c of comments) {
    const key = c.post.toString();
    if (!commentsByPost[key]) commentsByPost[key] = [];
    commentsByPost[key].push(c);
  }

  return posts.map((post) => {
    const key = post._id.toString();
    const postLikes = likesByPost[key] || [];
    const postComments = commentsByPost[key] || [];

    return {
      id: post._id,
      imageUrl: post.imageUrl,
      caption: post.caption,
      createdAt: post.createdAt.getTime(),
      author: post.author
        ? {
            id: post.author._id,
            username: post.author.username,
            displayName: post.author.displayName,
            avatarUrl: post.author.avatarUrl || null,
          }
        : null,
      likesCount: postLikes.length,
      isLiked: !!postLikes.find((l) => l.user.toString() === currentUserId.toString()),
      comments: postComments.map((c) => ({
        id: c._id,
        text: c.text,
        createdAt: c.createdAt.getTime(),
        author: c.user
          ? {
              id: c.user._id,
              username: c.user.username,
              displayName: c.user.displayName,
            }
          : null,
      })),
    };
  });
}

// ----- AUTH ROUTES -----

// Register
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password || username.length < 3) {
      return res
        .status(400)
        .json({ error: "Username >= 3 chars and password required" });
    }

    const existing = await User.findOne({ username: new RegExp(`^${username}$`, "i") });
    if (existing) {
      return res.status(409).json({ error: "Username already taken" });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const user = await User.create({
      username,
      passwordHash,
      displayName: username,
    });

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "7d" });

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        bio: user.bio,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

// Login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({
      username: new RegExp(`^${username}$`, "i"),
    });
    if (!user) {
      return res.status(400).json({ error: "Invalid username or password" });
    }

    const valid = bcrypt.compareSync(password, user.passwordHash);
    if (!valid) {
      return res.status(400).json({ error: "Invalid username or password" });
    }

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "7d" });

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        bio: user.bio,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// Current user
app.get("/api/me", authMiddleware, async (req, res) => {
  try {
    const u = req.user;
    const [myLikesCount, myPostsCount] = await Promise.all([
      Like.countDocuments({ user: u._id }),
      Post.countDocuments({ author: u._id }),
    ]);

    res.json({
      id: u._id,
      username: u.username,
      displayName: u.displayName,
      bio: u.bio,
      avatarUrl: u.avatarUrl,
      stats: {
        posts: myPostsCount,
        likesGiven: myLikesCount,
      },
    });
  } catch (err) {
    console.error("/api/me error:", err);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// Update profile
app.put("/api/me", authMiddleware, async (req, res) => {
  try {
    const { displayName, bio, avatarUrl } = req.body;
    if (displayName && displayName.length < 2) {
      return res.status(400).json({ error: "Display name too short" });
    }

    if (displayName !== undefined) req.user.displayName = displayName;
    if (bio !== undefined) req.user.bio = bio;
    if (avatarUrl !== undefined) req.user.avatarUrl = avatarUrl;

    await req.user.save();

    res.json({
      id: req.user._id,
      username: req.user.username,
      displayName: req.user.displayName,
      bio: req.user.bio,
      avatarUrl: req.user.avatarUrl,
    });
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(500).json({ error: "Update failed" });
  }
});

// ----- POSTS ROUTES -----

// List posts
app.get("/api/posts", authMiddleware, async (req, res) => {
  try {
    const scope = req.query.scope || "all"; // all | mine
    const filter = scope === "mine" ? { author: req.user._id } : {};

    const posts = await Post.find(filter)
      .sort({ createdAt: -1 })
      .populate("author", "username displayName avatarUrl")
      .lean();

    const dtos = await buildPostDtos(posts, req.user._id);
    res.json(dtos);
  } catch (err) {
    console.error("List posts error:", err);
    res.status(500).json({ error: "Failed to load posts" });
  }
});

// Create post
app.post("/api/posts", authMiddleware, async (req, res) => {
  try {
    const { imageUrl, caption } = req.body;
    if (!imageUrl || !caption) {
      return res.status(400).json({ error: "imageUrl and caption required" });
    }

    const post = await Post.create({
      author: req.user._id,
      imageUrl,
      caption,
    });

    const populated = await Post.findById(post._id)
      .populate("author", "username displayName avatarUrl")
      .lean();

    const [dto] = await buildPostDtos([populated], req.user._id);
    res.status(201).json(dto);
  } catch (err) {
    console.error("Create post error:", err);
    res.status(500).json({ error: "Failed to create post" });
  }
});

// Delete post
app.delete("/api/posts/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid post id" });
    }

    const post = await Post.findById(id);
    if (!post) return res.status(404).json({ error: "Post not found" });
    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "Not your post" });
    }

    await Promise.all([
      Post.deleteOne({ _id: id }),
      Like.deleteMany({ post: id }),
      Comment.deleteMany({ post: id }),
    ]);

    res.json({ success: true });
  } catch (err) {
    console.error("Delete post error:", err);
    res.status(500).json({ error: "Failed to delete post" });
  }
});

// Like a post
app.post("/api/posts/:id/like", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid post id" });
    }

    const post = await Post.findById(id).populate(
      "author",
      "username displayName avatarUrl"
    );
    if (!post) return res.status(404).json({ error: "Post not found" });

    try {
      await Like.create({ post: id, user: req.user._id });
    } catch (err) {
      // Ignore duplicate like errors
      if (err.code !== 11000) {
        console.error("Like error:", err);
      }
    }

    const dtos = await buildPostDtos([post.toObject()], req.user._id);
    res.json(dtos[0]);
  } catch (err) {
    console.error("Like post error:", err);
    res.status(500).json({ error: "Failed to like post" });
  }
});

// Unlike a post
app.post("/api/posts/:id/unlike", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid post id" });
    }

    const post = await Post.findById(id).populate(
      "author",
      "username displayName avatarUrl"
    );
    if (!post) return res.status(404).json({ error: "Post not found" });

    await Like.deleteOne({ post: id, user: req.user._id });

    const dtos = await buildPostDtos([post.toObject()], req.user._id);
    res.json(dtos[0]);
  } catch (err) {
    console.error("Unlike post error:", err);
    res.status(500).json({ error: "Failed to unlike post" });
  }
});

// Add comment
app.post("/api/posts/:id/comments", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid post id" });
    }

    const post = await Post.findById(id).populate(
      "author",
      "username displayName avatarUrl"
    );
    if (!post) return res.status(404).json({ error: "Post not found" });

    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Comment text required" });
    }

    await Comment.create({
      post: id,
      user: req.user._id,
      text: text.trim(),
    });

    const dtos = await buildPostDtos([post.toObject()], req.user._id);
    res.status(201).json(dtos[0]);
  } catch (err) {
    console.error("Add comment error:", err);
    res.status(500).json({ error: "Failed to add comment" });
  }
});

// Delete comment (comment author or post author)
app.delete(
  "/api/posts/:postId/comments/:commentId",
  authMiddleware,
  async (req, res) => {
    try {
      const { postId, commentId } = req.params;
      if (!Types.ObjectId.isValid(postId) || !Types.ObjectId.isValid(commentId)) {
        return res.status(400).json({ error: "Invalid ids" });
      }

      const post = await Post.findById(postId).populate(
        "author",
        "username displayName avatarUrl"
      );
      if (!post) return res.status(404).json({ error: "Post not found" });

      const comment = await Comment.findById(commentId);
      if (!comment || comment.post.toString() !== postId) {
        return res.status(404).json({ error: "Comment not found" });
      }

      const isCommentOwner = comment.user.toString() === req.user._id.toString();
      const isPostOwner = post.author._id.toString() === req.user._id.toString();
      if (!isCommentOwner && !isPostOwner) {
        return res.status(403).json({ error: "Not allowed" });
      }

      await Comment.deleteOne({ _id: commentId });

      const dtos = await buildPostDtos([post.toObject()], req.user._id);
      res.json(dtos[0]);
    } catch (err) {
      console.error("Delete comment error:", err);
      res.status(500).json({ error: "Failed to delete comment" });
    }
  }
);

// Health check
app.get("/", (req, res) => {
  res.send("Pixora backend running");
});

app.listen(PORT, () => {
  console.log(`🚀 Pixora backend listening on http://localhost:${PORT}`);
});
