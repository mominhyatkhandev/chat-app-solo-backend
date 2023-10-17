require("dotenv").config();
const express = require("express");
const bcryptjs = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const io = require("socket.io")(process.env.SOCKET_PORT || 8080, {
  cors: {
    origin: "*",
  },
});

//Connect DB
require("./db/connection");

//Import files
const Users = require("./models/Users");
const Conversations = require("./models/Conversation");
const Message = require("./models/Messages");

//app use
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors());

const PORT = process.env.PORT || 8000;

//Routes
app.get("/", (req, res) => {
  res.send({ response: "server is up and running" });
});

app.post("/api/register", async (req, res, next) => {
  try {
    const { fullName, email, password } = req.body;
    if (!fullName || !email || !password) {
      res.status(400).send("Please fill all the required fields!");
    } else {
      const isAlreadyExist = await Users.findOne({ email });
      if (isAlreadyExist) {
        res.status(400).send("User already exist");
      } else {
        const newUser = new Users({ fullName, email });
        bcryptjs.hash(password, 10, (err, hashedPassword) => {
          newUser.set("password", hashedPassword);
          newUser.save();
          console.log(newUser);
          next();
        });
        return res
          .status(200)
          .json({ msg: "User registered successfully!", user: newUser });
      }
    }
  } catch (e) {
    console.log("Sign up err", e);
  }
});

app.post("/api/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).send("Please fill all the required fields");
    } else {
      const user = await Users.findOne({ email });
      console.log(user, "USERRR");
      if (!user) {
        res.status(400).send("Users Email is incorrect!");
      } else {
        const validateUser = await bcryptjs.compare(password, user.password);
        if (!validateUser) {
          res.status(400).send("Users password is incorrect!");
        } else {
          const payload = {
            userId: user._id,
            email: user.email,
          };
          const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || "secret";
          jwt.sign(
            payload,
            JWT_SECRET_KEY,
            { expiresIn: 84600 },
            async (err, token) => {
              if (err) res.status(400).send("Error generating JWT");

              await Users.updateOne(
                { _id: user._id },
                {
                  $set: { token },
                }
              );
              await user.save();
              console.log(user);
              return res.status(200).send({ user, token });
            }
          );
        }
      }
    }
  } catch (e) {
    console.log("Log in error: ", e);
  }
});

app.post("/api/conversation", async (req, res) => {
  try {
    const { senderId, receiverId } = req.body;
    const newConversation = new Conversations({
      members: [senderId, receiverId],
    });
    await newConversation.save();
    res.status(200).send("Conversation created successfully!");
  } catch (e) {
    console.log("Creating conversation error", e);
  }
});

app.get("/api/conversation/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const conversations = await Conversations.find({
      members: { $in: [userId] },
    });
    const conversationUserData = Promise.all(
      conversations.map(async (conversation) => {
        const receiverId = conversation.members.find(
          (member) => member !== userId
        );
        const user = await Users.findById(receiverId);
        return {
          user: {
            receiverId: user._id,
            email: user.email,
            fullName: user.fullName,
          },
          conversationId: conversation._id,
        };
      })
    );
    res.status(200).json(await conversationUserData);
  } catch (e) {
    console.log("Fetching conversations error", e);
  }
});

app.post("/api/message", async (req, res) => {
  try {
    const { conversationId, senderId, message, receiverId = "" } = req.body;
    if (!senderId || !message) {
      return res.status(400).send("Please fill all the required feilds");
    }
    if (conversationId === "new" && receiverId) {
      const newConversation = new Conversations({
        members: [senderId, receiverId],
      });
      await newConversation.save();
      const newMessage = new Message({
        conversationId: newConversation._id,
        senderId,
        message,
      });
      await newMessage.save();
      return res.status(200).send("Message sent successfully!");
    } else if (!conversationId && !receiverId) {
      return res.status(400).send("Please fill all the required feilds");
    }
    const newMessage = new Message({ conversationId, senderId, message });
    await newMessage.save();
    res.status(200).send("Message sent successfully!");
  } catch (e) {
    console.log("Posting message error", e);
  }
});

app.get("/api/message/:conversationId", async (req, res) => {
  try {
    const checkMessages = async (conversationId) => {
      console.log(conversationId, "conversationId");
      const messages = await Message.find({ conversationId });
      const messageUserData = Promise.all(
        messages.map(async (message) => {
          const user = await Users.findById(message.senderId);
          return {
            user: { id: user._id, email: user.email, fullName: user.fullName },
            message: message.message,
          };
        })
      );
      res.status(200).json(await messageUserData);
    };
    const conversationId = req.params.conversationId;
    if (conversationId === "new") {
      const checkConversation = await Conversations.find({
        members: { $all: [req.query.senderId, req.query.receiverId] },
      });
      if (checkConversation.length > 0) {
        checkMessages(checkConversation[0]._id);
      } else {
        return res.status(200).json([]);
      }
    } else {
      checkMessages(conversationId);
    }
    // const messages = await Message.find({ conversationId });
    // const messageDataUser = Promise.all(
    //   messages.map(async (message) => {
    //     const user = await Users.findById(message.senderId);
    //     return {
    //       user: { id: user._id, email: user.email, fullName: user.fullName },
    //       message: message.message,
    //     };
    //   })
    // );

    // res.status(200).json(await messageDataUser);
  } catch (e) {
    console.log("Fetching messages via conversation ID error", e);
  }
});

app.get("/api/users/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const users = await Users.find({ _id: { $ne: userId } });
    const usersData = Promise.all(
      users.map(async (user) => {
        return {
          user: {
            email: user.email,
            fullName: user.fullName,
            receiverId: user._id,
          },
        };
      })
    );
    res.status(200).json(await usersData);
  } catch (error) {
    console.log("Fetching all users Error", error);
  }
});

app.listen(PORT, () => {
  console.log(`listening on port ${PORT}`);
});
