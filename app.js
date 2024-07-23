import express from "express";
import path from "path";
import { open } from "sqlite";
import sqlite3 from "sqlite3";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// Initialize Express application
const app = express();
app.use(express.json());

// Define the path to the database
const dbPath = path.join(process.cwd(), "twitterClone.db");

let db = null;

// Initialize database and server
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

// Define secret key for JWT
const secretKey = "your_secret_key";

// Middleware to authenticate JWT token
function authenticateToken(req, res, next) {
  const authHeader = req.header("Authorization");
  if (!authHeader) return res.status(401).send("Invalid JWT Token");

  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).send("Invalid JWT Token");

  jwt.verify(token, secretKey, (err, user) => {
    if (err) return res.status(401).send("Invalid JWT Token");
    req.user = user;
    next();
  });
}

// API 1: Register
app.post("/register/", async (req, res) => {
  const { name, username, password, gender } = req.body;

  // Check if password is less than 6 characters
  if (password.length < 6) {
    return res.status(400).send("Password is too short");
  }

  try {
    // Check if the username already exists
    const checkUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
    const existingUser = await db.get(checkUserQuery);

    if (existingUser) {
      return res.status(400).send("User already exists");
    }

    // Hash the password and insert the new user
    const hashedPassword = bcrypt.hashSync(password, 10);
    const insertUserQuery = `INSERT INTO user (name, username, password, gender) VALUES ('${name}', '${username}', '${password}', '${gender}')`;
    await db.run(insertUserQuery);
    res.status(200).send("User created successfully");
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).send("Internal Server Error");
  }
});

// API 2: Login
app.post("/login/", async (req, res) => {
  const { username, password } = req.body;

  try {
    // Check if the user exists
    const getUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
    const user = await db.get(getUserQuery);

    if (!user) {
      return res.status(400).send("Invalid user");
    }

    // Check if the password is correct
    const isPasswordCorrect = bcrypt.compareSync(password, user.password);
    if (!isPasswordCorrect) {
      return res.status(400).send("Invalid password");
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user.user_id }, secretKey);
    res.send({ jwtToken: token });
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).send("Internal Server Error");
  }
});

// API 3: Get latest tweets feed
app.get("/user/tweets/feed/", authenticateToken, async (req, res) => {
  try {
    const getTweetsQuery = `
      SELECT tweet.*, user.username
      FROM tweet 
      JOIN follower ON tweet.user_id = follower.following_user_id 
      JOIN user ON tweet.user_id = user.user_id
      ORDER BY tweet.date_time DESC
      LIMIT 4`;
    const tweets = await db.all(getTweetsQuery);
    res.send(tweets);
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).send("Internal Server Error");
  }
});

// API 4: Get following users
app.get("/user/following/", authenticateToken, async (req, res) => {
  try {
    const getFollowingQuery = `
      SELECT user.name 
      FROM follower 
      JOIN user ON follower.following_user_id = user.user_id `;
    const following = await db.all(getFollowingQuery);
    res.send(following.map((user) => user.name));
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).send("Internal Server Error");
  }
});

// API 5: Get followers
app.get("/user/followers/", authenticateToken, async (req, res) => {
  try {
    const getFollowersQuery = `
      SELECT user.name 
      FROM follower 
      JOIN user ON follower.follower_user_id = user.user_id `;
    const followers = await db.all(getFollowersQuery);
    res.send(followers.map((user) => user.name));
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).send("Internal Server Error");
  }
});

// API 6: Get tweet details
app.get("/tweets/:tweetId/", authenticateToken, async (req, res) => {
  const tweetId = req.params.tweetId;
  try {
    const getTweetQuery = `
      SELECT tweet.tweet, tweet.date_time,
        (SELECT COUNT(*) FROM like WHERE like.tweet_id = tweet.tweet_id) AS likes,
        (SELECT COUNT(*) FROM reply WHERE reply.tweet_id = tweet.tweet_id) AS replies
      FROM tweet
      JOIN follower ON tweet.user_id = follower.following_user_id
      WHERE tweet.tweet_id = '${tweetId}'`;
    const tweet = await db.get(getTweetQuery);
    console.log(tweet);

    if (!tweet) {
      return res.status(401).send("Invalid Request");
    }

    res.send({
      tweet: tweet.tweet,
      likes: tweet.likes,
      replies: tweet.replies,
      dateTime: tweet.date_time,
    });
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).send("Internal Server Error");
  }
});

// API 7: Get users who liked a tweet
app.get("/tweets/:tweetId/likes/", authenticateToken, async (req, res) => {
  const tweetId = req.params.tweetId;
  try {
    const getLikesQuery = `
      SELECT user.username
      FROM like
      JOIN user ON like.user_id = user.user_id
      JOIN tweet ON like.tweet_id = tweet.tweet_id
      JOIN follower ON tweet.user_id = follower.following_user_id
      WHERE like.tweet_id = ${tweetId}`;
    const likes = await db.all(getLikesQuery);

    if (likes.length === 0) {
      return res.status(401).send("Invalid Request");
    }

    res.send({ likes: likes.map((like) => like.username) });
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).send("Internal Server Error");
  }
});

// API 8: Get replies for a tweet
app.get("/tweets/:tweetId/replies/", authenticateToken, async (req, res) => {
  const tweetId = req.params.tweetId;
  try {
    const getRepliesQuery = `
      SELECT reply.reply, user.username
      FROM reply
      JOIN user ON reply.user_id = user.user_id
      JOIN tweet ON reply.tweet_id = tweet.tweet_id
      JOIN follower ON tweet.user_id = follower.following_user_id
      WHERE reply.tweet_id = ${tweetId}`;
    const replies = await db.all(getRepliesQuery);
    console.log(replies);

    if (replies.length === 0) {
      return res.status(401).send("Invalid Request");
    }

    res.send(replies);
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).send("Internal Server Error");
  }
});

// API 9: Get user's tweets
app.get("/user/tweets/", authenticateToken, async (req, res) => {
  try {
    const getTweetsQuery = `SELECT * FROM tweet
    JOIN user ON tweet.user_id = user.user_id`;
    const tweets = await db.all(getTweetsQuery);
    res.send(tweets);
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).send("Internal Server Error");
  }
});

// API 10: Create a tweet
app.post("/user/tweets/", authenticateToken, async (req, res) => {
  const { tweet } = req.body;
  const userId = req.user.userId;
  try {
    const createTweetQuery = `INSERT INTO tweet (tweet, user_id, date_time) VALUES ('${tweet}', ${userId}, datetime('now'))`;
    await db.run(createTweetQuery);
    res.send("Tweet created successfully");
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).send("Internal Server Error");
  }
});

// API 11: Delete a tweet
app.delete("/tweets/:tweetId/", authenticateToken, async (req, res) => {
  const tweetId = req.params.tweetId;
  try {
    // Check if the tweet belongs to the user
    const getTweetQuery = `SELECT * FROM tweet WHERE tweet_id = ${tweetId}`;
    const tweet = await db.get(getTweetQuery);

    if (!tweet) {
      return res.status(401).send("Invalid Request");
    }

    // Delete the tweet
    const deleteTweetQuery = `DELETE FROM tweet WHERE tweet_id = ${tweetId}`;
    await db.run(deleteTweetQuery);
    res.send("Tweet removed");
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).send("Internal Server Error");
  }
});

export default app;
