const prisma = require("../prisma/client");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

require("dotenv").config();

const createUser = async (req, res) => {
  const { secret, username, email, password, role } = req.body;

  // Only allow if the provided secret matches the one in .env
  if (secret !== process.env.ADMIN_CREATION_SECRET) {
    return res.status(403).json({ message: "Forbidden: Invalid secret" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        name: username,
        email: email,
        password: hashedPassword,
        role: role, // e.g., 'admin' or 'operation'
      },
    });

    res.json({ message: "User created successfully", userId: newUser.id });
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ message: "Error creating user" });
  }
};

const loginUser = async (req, res) => {
  const { username, password } = req.body;

  try {
    // Find user by username
    const user = await prisma.user.findFirst({
      where: { name: username },
    });

    // Check if the user exists and if the password is correct
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Generate JWT token with user ID and role
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" } // Token expiration
    );

    // Set the token in an HTTP-only cookie
    res.cookie("token", token, {
      httpOnly: true, // Make the cookie inaccessible to JavaScript
      secure: process.env.NODE_ENV === "production", // Use HTTPS in production
      maxAge: 24 * 60 * 60 * 1000, // 1 day expiration
      sameSite: "Strict", // Mitigate CSRF
    });

    // Respond with the user info and success message
    res.json({
      message: "Login successful",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const check = async (req, res) => {
  res.status(200).json({ message: "Authenticated", user: req.user });
};

module.exports = { createUser, loginUser, check };
