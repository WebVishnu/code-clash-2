// server/index.js

const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const cors = require("cors");
const { runCodeVM } = require("./runCodeVM");
const { getRandomQuestion } = require("./questions");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

// Room structure:
//
// rooms = {
//   [roomId]: {
//      players: { [playerId]: socketId },
//      codes: { [playerId]: vmResult },
//      question,
//      startTime,
//      firstSubmitAt,
//      submissionDeadline,
//      winnerDeclared,
//   }
// }
const rooms = {};

io.on("connection", (socket) => {
  const playerId = socket.handshake.query.playerId || `p-${socket.id}`;
  console.log("🔥 Connected:", playerId, "socket:", socket.id);

  // JOIN ROOM
  socket.on("join_room", ({ roomId, playerId }) => {
    console.log("join_room:", roomId, playerId);
    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = {
        players: {},
        codes: {},
        question: null,
        startTime: null,
        firstSubmitAt: null,
        submissionDeadline: null,
        winnerDeclared: false,
      };
    }

    const room = rooms[roomId];
    room.players[playerId] = socket.id;

    // Fix question once
    if (!room.question) {
      room.question = getRandomQuestion();
    }

    const playerCount = Object.keys(room.players).length;

    // Start time once when 2nd player joins
    if (playerCount === 2 && !room.startTime) {
      room.startTime = Date.now();
    }

    io.to(roomId).emit("player_joined", {
      players: Object.keys(room.players),
    });

    if (playerCount === 2) {
      io.to(roomId).emit("battle_start", {
        question: room.question,
        startTime: room.startTime,
      });
    }
  });

  // TYPING
  socket.on("typing", ({ roomId }) => {
    socket.to(roomId).emit("opponent_typing");
  });

  // SUBMIT CODE
  socket.on("submit_code", async ({ roomId, code, playerId }) => {
    const room = rooms[roomId];
    if (!room || room.winnerDeclared || !room.question) return;

    console.log("submit_code from", playerId, "in room", roomId);

    const vmResult = await runCodeVM(code, room.question.testcases);
    room.codes[playerId] = vmResult;

    // Tell everyone this player got a raw VM result (for debugging / UI)
    io.to(roomId).emit("player_result", {
      playerId,
      result: vmResult,
    });

    const submittedCount = Object.keys(room.codes).length;

    // ----------------------------
    // CASE 1: FIRST SUBMISSION
    // ----------------------------
    if (submittedCount === 1 && !room.firstSubmitAt) {
      room.firstSubmitAt = Date.now();
      room.submissionDeadline = room.firstSubmitAt + 60_000; // +1 min

      const { scores } = computeScoresPartial(room.codes, playerId);

      // send this player's score immediately + deadline
      io.to(roomId).emit("first_submission", {
        firstPlayerId: playerId,
        result: vmResult,
        score: scores[playerId],
        deadline: room.submissionDeadline,
      });

      // server-side auto-timeout: if second doesn't submit in 1 min
      setTimeout(() => {
        autoEndIfSecondDidNotSubmit(roomId);
      }, 60_000);

      return;
    }

    // ----------------------------
    // CASE 2: SECOND SUBMISSION
    // ----------------------------
    if (submittedCount === 2 && !room.winnerDeclared) {
      const { scores, winner } = computeScores(room.codes);
      room.winnerDeclared = true;

      io.to(roomId).emit("duel_complete", {
        codes: room.codes,
        scores,
        winner,
        deadline: room.submissionDeadline,
        reason: "both_submitted",
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("⚠️ disconnected:", playerId);
    // (optional) clean up player from rooms
  });
});

// ------------------------------------------------
// AUTO END IF SECOND DOESN'T SUBMIT IN 1 MIN
// ------------------------------------------------
function autoEndIfSecondDidNotSubmit(roomId) {
  const room = rooms[roomId];
  if (!room || room.winnerDeclared || !room.submissionDeadline) return;

  const submittedPlayerIds = Object.keys(room.codes);
  if (submittedPlayerIds.length !== 1) return; // either none or both already sent

  const firstPlayerId = submittedPlayerIds[0];

  const { scores } = computeScoresPartial(room.codes, firstPlayerId);

  room.winnerDeclared = true;

  io.to(roomId).emit("duel_complete", {
    codes: room.codes,
    scores,
    winner: firstPlayerId,
    deadline: room.submissionDeadline,
    reason: "timeout_second_player",
  });
}

// ------------------------------------------------
// SCORING HELPERS
// ------------------------------------------------

// full scoring when both players have submitted
function computeScores(codeResults) {
  const playerIds = Object.keys(codeResults);
  if (playerIds.length !== 2) return { scores: {}, winner: null };

  const [A, B] = playerIds;
  const rA = codeResults[A];
  const rB = codeResults[B];

  const scoreA = calcScore(rA, rA, rB);
  const scoreB = calcScore(rB, rA, rB);

  let winner = null;
  if (scoreA.total > scoreB.total) winner = A;
  else if (scoreB.total > scoreA.total) winner = B;
  else winner = "TIE";

  return {
    scores: {
      [A]: scoreA,
      [B]: scoreB,
    },
    winner,
  };
}

// partial scoring when only one player has submitted
function computeScoresPartial(codeResults, playerId) {
  const r = codeResults[playerId];
  const score = calcScore(r, r, null); // compare against itself

  return {
    scores: {
      [playerId]: score,
    },
  };
}

// actual scoring formula (0–100)
function calcScore(r, baseA, baseB) {
  const correctness = r.total ? r.passed / r.total : 0;

  let maxExec, maxLen;
  if (baseB) {
    maxExec = Math.max(baseA.execTime || 1, baseB.execTime || 1);
    maxLen = Math.max(baseA.codeLength || 1, baseB.codeLength || 1);
  } else {
    // only one player -> full marks relative to self for speed & length
    maxExec = r.execTime || 1;
    maxLen = r.codeLength || 1;
  }

  const corrScore = correctness * 70;
  const speedScore =
    maxExec > 0 ? (1 - (r.execTime || maxExec) / maxExec) * 15 : 0;
  const lengthScore =
    maxLen > 0 ? (1 - (r.codeLength || maxLen) / maxLen) * 15 : 0;

  const total = Math.max(
    0,
    Math.min(100, corrScore + speedScore + lengthScore)
  );

  return {
    correctness: +corrScore.toFixed(2),
    speed: +speedScore.toFixed(2),
    length: +lengthScore.toFixed(2),
    total: +total.toFixed(2),
  };
}

server.listen(3001, () => {
  console.log("🚀 Socket.io server running on http://localhost:3001");
});
