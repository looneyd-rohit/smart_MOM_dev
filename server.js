/* The `dotenv` package allows us to load environment
 * variables from the `.env` file. Then, we can access them
 * with `process.env.ENV_VAR_NAME`.
 */

const fs = require('fs');

require("dotenv").config();
const cors = require('cors')
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const { Deepgram } = require("@deepgram/sdk");

const DG_KEY = process.env.DG_KEY;

if (DG_KEY === undefined) {
    throw "You must define DG_KEY in your .env file";
}

const app = express();
let server = http.createServer(app);

/*
 * Basic configuration:
 * - we expose the `/public` folder as a "static" folder, so the
 *   browser can directly request the js and css files that it contains.
 * - we send the `/public/index.html` file when the browser requests
 *   any route.
 */
app.use(cors())
app.use(express.static(__dirname + "/public"));
app.get("*", function (req, res) {
    res.sendFile(`${__dirname}/public/index.html`);
});

const SocketIoServer = require("socket.io").Server;
const Socket = require("socket.io").Socket;
const io = new SocketIoServer(server);
io.sockets.on("connection", handle_connection);
let users = {};

// const MAX_CLIENTS = 2;
/**
 * This function will be called every time a client
 * opens a socket with the server. This is where we will define
 * what to do in reaction to messages sent by clients.
 * @param {Socket} socket */
function handle_connection(socket) {

    socket.on("join", (room, username) => {

        socket.join(room);
        users[socket.id] = username;
        socket.broadcast.to(room).emit("user-joined", socket.id);

        setupWebRTCSignaling(socket);
        setupRealtimeTranscription(socket, room);

        socket.on("disconnect", () => {
            socket.broadcast.to(room).emit("bye", socket.id);
        });
    });
}

/**
 * @param {Socket} socket
 * @param {string} room
 */
function setupRealtimeTranscription(socket, room) {
    /** The sampleRate must match what the client uses. */
    const sampleRate = 16000;

    const deepgram = new Deepgram(DG_KEY);

    const dgSocket = deepgram.transcription.live({
        punctuate: true,
        interim_results: false,
        language: 'en-IN'
    });

    /** We must receive the very first audio packet from the client because
     * it contains some header data needed for audio decoding.
     *
     * Thus, we send a message to the client when the socket to Deepgram is ready,
     * so the client knows it can start sending audio data.
     */
    dgSocket.addListener("open", () => socket.emit("can-open-mic"));

    /**
     * We forward the audio stream from the client's microphone to Deepgram's server.
     */
    socket.on("microphone-stream", (stream) => {
        if (dgSocket.getReadyState() === WebSocket.OPEN) {
            dgSocket.send(stream);
        }
    });

    /** On Deepgram's server message, we forward the response back to all the
     * clients in the room.
     */
    dgSocket.addListener("transcriptReceived", async (transcription) => {
        // io.to(room).emit("transcript-result", socket.id, transcription);
        // console.log('transcribed')
        // console.log(transcription)
        let dummy = JSON.parse(transcription)['channel']['alternatives'][0]['transcript'];
        console.log(dummy);
        const _name = users[socket.id];
        const final_transcript = _name + " : " + dummy + "\n";
        try {
            if (dummy.length > 0) {
                fs.appendFile('mytranscript.txt', final_transcript, (err) => {
                    if (err) throw err;
                })
            }
        } catch (e) {
            console.log('Error Writing to file');
        }
    });

    /** We close the dsSocket when the client disconnects. */
    socket.on("disconnect", () => {
        if (dgSocket.getReadyState() === WebSocket.OPEN) {
            dgSocket.finish();
        }
    });
}

/**
 * Handle the WebRTC "signaling". This means we forward all the needed data from
 * Alice to Bob to establish a peer-to-peer connection. Once the peer-to-peer
 * connection is established, the video stream won't go through the server.
 *
 * @param {Socket} socket
 */
function setupWebRTCSignaling(socket) {
    // socket.on("video-offer", (id, message) => {
    //     socket.to(id).emit("video-offer", socket.id, message);
    // });
    // socket.on("video-answer", (id, message) => {
    //     socket.to(id).emit("video-answer", socket.id, message);
    // });
    socket.on("ice-candidate", (id, message) => {
        socket.to(id).emit("ice-candidate", socket.id, message);
    });
}

const listener = server.listen(process.env.PORT, () =>
    console.log(`Server is running on port ${process.env.PORT}`)
);




// class Transcript {
//     constructor() {
//         // /** @type {Map<number, {words: string, is_final: boolean}>} */
//         this.chunks = new Map();
//     }

//     addServerAnswer(jsonFromServer) {
//         const words = JSON.parse(jsonFromServer).channel.alternatives[0]
//             .transcript;
//         if (words !== "") {
//             this.chunks.set(jsonFromServer.start, {
//                 words,
//                 // if "is_final" is true, we will never have future updates for this
//                 // audio chunk.
//                 is_final: jsonFromServer.is_final,
//             });
//         }
//     }

//     toHtml() {
//         const divNode = document.createElement("div");
//         divNode.className = "transcript-text";
//         [...this.chunks.entries()]
//             .sort((entryA, entryB) => entryA[0] - entryB[0])
//             .forEach((entry) => {
//                 const spanNode = document.createElement("span");
//                 spanNode.innerText = entry[1].words;
//                 spanNode.className = entry[1].is_final ? "final" : "interim";
//                 divNode.appendChild(spanNode);
//                 divNode.appendChild(document.createTextNode(" "));
//             });

//         return divNode;
//     }
// }