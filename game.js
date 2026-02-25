const firebaseConfig = {
    apiKey: "AIzaSyCktzF_jcDDLPq5r3qvZFA36Sr8hmWGVKs",
    authDomain: "soungfisfluke.firebaseapp.com",
    databaseURL: "https://soungfisfluke-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "soungfisfluke",
    storageBucket: "soungfisfluke.firebasestorage.app",
    messagingSenderId: "759522644508",
    appId: "1:759522644508:web:f7b5b762d5f7ba03dac5d9"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let roomCode = "";
let playerId = Math.random().toString(36).substring(2);
let playerName = "";
let isHost = false;
let roomRef = null;

function renderHome() {
    document.getElementById("app").innerHTML = `
    <div class="card">
      <input id="name" placeholder="ระบุชื่อของคุณ" maxlength="15"><br>
      <button onclick="createRoom()">สร้างห้องใหม่</button>
      <div style="margin: 15px 0; opacity: 0.5;">— หรือ —</div>
      <input id="roomInput" placeholder="รหัสห้อง (4 หลัก)"><br>
      <button class="secondary" onclick="joinRoom()">เข้าห้อง</button>
    </div>`;
}

async function createRoom() {
    playerName = document.getElementById("name").value.trim();
    if (!playerName) return alert("กรุณาใส่ชื่อ");
    roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    isHost = true;
    roomRef = db.ref("rooms/" + roomCode);

    await roomRef.set({
        state: "lobby",
        host: playerId,
        players: {}
    });
    joinRoom();
}

function joinRoom() {
    playerName = document.getElementById("name").value.trim();
    if (!playerName) return alert("ใส่ชื่อก่อน");

    if (!isHost) {
        roomCode = document.getElementById("roomInput").value.toUpperCase();
        if (!roomCode) return alert("ใส่รหัสห้องก่อน");
        roomRef = db.ref("rooms/" + roomCode);
    }

    roomRef.child("players/" + playerId).set({
        name: playerName,
        score: 0
    });

    roomRef.child("players/" + playerId).onDisconnect().remove();
    listenRoom();
}

// --- ฟังก์ชันออกจากห้อง ---
async function leaveRoom() {
    if (!roomRef) return renderHome();
    
    // ลบตัวเองออกจากรายชื่อ
    await roomRef.child("players/" + playerId).remove();
    
    // ตรวจสอบว่าเหลือใครไหม
    const snapshot = await roomRef.child("players").once("value");
    if (!snapshot.exists()) {
        await roomRef.remove(); // ลบห้องทิ้งถ้าว่างเปล่า
    } else if (isHost) {
        // ถ้า Host ออก ให้โอนสิทธิ์ Host ให้คนแรกที่เจอ
        const players = snapshot.val();
        const nextHost = Object.keys(players)[0];
        await roomRef.update({ host: nextHost });
    }

    roomRef.off(); // หยุดฟัง Event
    roomRef = null;
    roomCode = "";
    isHost = false;
    renderHome();
}

function listenRoom() {
    roomRef.on("value", snap => {
        const data = snap.val();
        if (!data) return renderHome();

        isHost = data.host === playerId;
        switch (data.state) {
            case "lobby": showLobby(data); break;
            case "talk": showTalk(data); break;
            case "guess": showGuess(data); break;
            case "result": showResult(data); break;
        }
    });
}

function showLobby(data) {
    let html = `<div class="card"><h3>รหัสห้อง: ${roomCode}</h3><div style="margin:10px 0">`;
    for (let id in data.players) {
        html += `<p>${id === data.host ? '👑 ' : ''}${data.players[id].name}</p>`;
    }
    html += `</div>`;
    if (isHost) html += `<button onclick="startGame()">เริ่มเกม</button>`;
    html += `<br><button class="danger" onclick="leaveRoom()">ออกจากห้อง</button></div>`;
    document.getElementById("app").innerHTML = html;
}

function startGame() {
    roomRef.child("players").once("value").then(snapshot => {
        const playersData = snapshot.val();
        const ids = Object.keys(playersData);
        if (ids.length < 3) return alert("ต้องมีอย่างน้อย 3 คน");

        const guesser = ids[Math.floor(Math.random() * ids.length)];
        let truth;
        do { truth = ids[Math.floor(Math.random() * ids.length)]; } while (truth === guesser);

        const q = getRandomQuestion();
        roomRef.update({
            guesser, truth, question: q.question, answer: q.answer,
            guessed: null, scored: false, state: "talk"
        });
    });
}

function showTalk(data){
 const isGuesser = data.guesser === playerId;
 const isTruth = data.truth === playerId;

 // หาข้อมูลคำถามปัจจุบันจาก QUESTION_BANK (เพื่อดึง lieGuide ออกมา)
 const currentQ = QUESTION_BANK.find(q => q.question === data.question);

 let html = `<div class="card">
 <h3>${data.question}</h3>`;

 if(isGuesser){
   html += `<p class="small">คุณคือคนทาย 👑<br><b>จงจับผิดเพื่อนให้ได้!</b></p>`;
 } else {
   html += `<p class="small" style="text-align:left; background:#0f172a; padding:15px; border-radius:10px;">
   ✅ <b>คำตอบจริง:</b> ${data.answer}<br><br>
   🎭 <b>บทบาท:</b> ${isTruth ? "<span style='color:#4ade80'>คุณต้องพูดความจริง</span>" : "<span style='color:#fb7185'>คุณต้องโกหก!</span>"}<br>
   ${!isTruth && currentQ ? `💡 <b>ทริคการหลอก:</b> ${currentQ.lieGuide}` : ""}
   </p>`;
 }

 if(isHost){
   html += `<button onclick="roomRef.update({state:'guess'})">ไปหน้าทาย</button>`;
 }

 html += `</div>`;
 document.getElementById("app").innerHTML = html;
}

function showGuess(data) {
    if (playerId !== data.guesser) {
        document.getElementById("app").innerHTML = `<div class="card"><h3>${data.players[data.guesser].name} กำลังทาย...</h3></div>`;
        return;
    }
    let html = `<div class="card"><h3>${data.question}</h3><p>ใครพูดความจริง?</p></div>`;
    for (let id in data.players) {
        if (id === data.guesser) continue;
        html += `<div class="card" style="display:flex; justify-content:space-between; align-items:center;">
            <span>${data.players[id].name}</span>
            <button onclick="selectGuess('${id}')">คนนี้แหละ</button>
        </div>`;
    }
    document.getElementById("app").innerHTML = html;
}

function selectGuess(id) {
    roomRef.update({ guessed: id, state: "result" });
}

function showResult(data) {
    const correct = data.guessed === data.truth;
    if (!data.scored && isHost) {
        if (correct) {
            roomRef.child("players/" + data.guesser + "/score").transaction(s => (s || 0) + 1);
        }
        roomRef.update({ scored: true });
    }

    let html = `<div class="card">
        <h3>${correct ? "ทายถูก! 🎉" : "ทายผิด! ❌"}</h3>
        <p>คำตอบคือ: <b>${data.answer}</b></p>
        <p>คนพูดจริงคือ: <b>${data.players[data.truth].name}</b></p>
    </div>
    <div class="card"><h3>ตารางคะแนน</h3>`;
    for (let id in data.players) {
        html += `<p>${data.players[id].name}: ${data.players[id].score || 0}</p>`;
    }
    if (isHost) html += `<button onclick="resetRound()">รอบถัดไป</button>`;
    html += `<br><button class="danger" onclick="leaveRoom()">ออกจากห้อง</button></div>`;
    document.getElementById("app").innerHTML = html;
}

function resetRound() {
    roomRef.update({
        state: "lobby", guesser: null, truth: null,
        question: null, answer: null, guessed: null, scored: false
    });
}

renderHome();