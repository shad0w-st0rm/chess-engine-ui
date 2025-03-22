import { useState, useEffect, useRef } from "react";
import { Chess, Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import { Piece } from "react-chessboard/dist/chessboard/types";
import { Button, Dimensions, TextInput, View, StyleSheet, ScrollView, Text } from "react-native";
import alert from '../components/alert';

export default function Engine() {
  const [game, setGame] = useState(new Chess());
  const [gameOver, setGameOver] = useState(false);
  const [fenInput, setFenInput] = useState("");
  const [playerID, setPlayerID] = useState(0);

  // Board orientation state
  const [boardOrientation, setBoardOrientation] = useState("white");
  const [playerColor, setPlayerColor] = useState("white");

  // Time control states
  const [timeControl, setTimeControl] = useState("10");
  const [increment, setIncrement] = useState("5");
  const [whiteTime, setWhiteTime] = useState(600); // in seconds
  const [blackTime, setBlackTime] = useState(600); // in seconds
  const [isClockRunning, setIsClockRunning] = useState(false);
  const [activeColor, setActiveColor] = useState("w"); // w or b based on whose turn it is

  // Clock timer refs and state - with properly typed clockIntervalRef
  const clockIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const gameRef = useRef(game);
  const gameOverRef = useRef(gameOver);
  const playerColorRef = useRef(playerColor);
  const lastMoveTimeRef = useRef(Date.now());
  const playerIDRef = useRef(playerID);

  const serverURL = "https://153.33.224.180:49178";

  // Initialize the engine on component mount
  useEffect(() => {
    getNewGame();
  }, []);

  // Update gameRef when game changes
  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  // Update gameOverRef when gameOver changes
  useEffect(() => {
    gameOverRef.current = gameOver;
  }, [gameOver]);
  
  useEffect(() => {
    playerColorRef.current = playerColor;
  }, [playerColor]);

  // Clock effect
  useEffect(() => {
    if (isClockRunning) {
      clockIntervalRef.current = setInterval(() => {
        if (activeColor === "w") {
          setWhiteTime(prevTime => {
            if (prevTime <= 0) {
              handleTimeOut("white");
              return 0;
            }
            return prevTime - 1;
          });
        } else {
          setBlackTime(prevTime => {
            if (prevTime <= 0) {
              handleTimeOut("black");
              return 0;
            }
            return prevTime - 1;
          });
        }
      }, 1000);
    }

    return () => {
      if (clockIntervalRef.current) {
        clearInterval(clockIntervalRef.current);
      }
    };
  }, [isClockRunning, activeColor]);

  useEffect(() => {
    // Function to send the keepalive request to the backend
    const sendKeepAliveRequest = async () => {
      try {
        const response = await fetch(`${serverURL}/keepalive?playerID=${playerIDRef.current}`);
        if (response.ok) {
          console.log('Keep-alive request successful');
        } else {
          console.error('Failed to send keep-alive request. Status Code:', response.status);
        }
      } catch (error) {
        console.error('Error sending keep-alive request:', error);
      }
    };

    // Set interval to send the keep-alive request every 30 seconds
    const keepAliveInterval = setInterval(() => {
      sendKeepAliveRequest();
    }, 30 * 1000); // 30 seconds

    // Clean up interval on component unmount
    return () => clearInterval(keepAliveInterval);
  }, []);

  // Initialize time when time control changes
  useEffect(() => {
    const seconds = parseFloat(timeControl) * 60;
    setWhiteTime(seconds);
    setBlackTime(seconds);
  }, [timeControl]);

  const getNewGame = async () => {
    try {
      // Send the POST request to the server
      const response = await fetch(`${serverURL}/newgame`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: "startpos",
      });
      if (response.ok) {
        const data = await response.json();
        setPlayerID(data.playerID);
        playerIDRef.current = data.playerID;
        console.log('PlayerID received:', data.playerID);
      }
      else {
        console.error("Failed to initialize game. Status code: " + response.status);
      }

    } catch (error) {
      console.error('Error initializing engine:', error);
    }
  };

  const endGame = async () => {
    try {
      const response = await fetch(`${serverURL}/endgame/?playerID=${playerIDRef.current}`);
      if (response.ok) {
        console.log(response.text());
      }
      else {
        console.error('Failed to end game. Status Code:', response.status);
      }
    } catch (error) {
      console.error('Error ending game:', error);
    }
  }

  const handleTimeOut = (color: string) => {
    if (gameOverRef.current) return;

    if (clockIntervalRef.current) {
      clearInterval(clockIntervalRef.current);
    }
    setIsClockRunning(false);
    setGameOver(true);

    alert("Game Over", `${color === "white" ? "Black" : "White"} wins on time!`, [
      { text: "Ok", onPress: () => { }, style: "default" }
    ]);
  };

  const startClock = () => {
    lastMoveTimeRef.current = Date.now();
    setIsClockRunning(true);
  };

  const stopClock = () => {
    setIsClockRunning(false);
    if (clockIntervalRef.current) {
      clearInterval(clockIntervalRef.current);
    }
  };

  const applyIncrement = (color: string) => {
    const inc = parseFloat(increment);
    if (color === "w") {
      setWhiteTime(prevTime => prevTime + inc);
    } else {
      setBlackTime(prevTime => prevTime + inc);
    }
  };

  const switchActiveColor = () => {
    setActiveColor(prev => prev === "w" ? "b" : "w");
  };

  const engineMove = async () => {
    if (gameOverRef.current || !gameRef.current.turn() || (playerColorRef.current === "white" && gameRef.current.turn() === "w") || (playerColorRef.current === "black" && gameRef.current.turn() === "b")) {
      return;
    }

    try {
      // Prepare the time control parameters
      const wtime = Math.round(whiteTime * 1000); // convert to milliseconds
      const btime = Math.round(blackTime * 1000);
      const winc = Math.round(parseFloat(increment) * 1000);
      const binc = Math.round(parseFloat(increment) * 1000);

      // Request move with time controls
      const moveResponse = await fetch(`${serverURL}/bestmove?playerID=${playerIDRef.current}&wtime=${wtime}&winc=${winc}&btime=${btime}&binc=${binc}`);
      if (moveResponse.ok) {
        const moveData = await moveResponse.text();
        console.log('Engine move:', moveData);

        // Stop clock, apply move, apply increment, switch active color, restart clock
        stopClock();
        const prevTurn = gameRef.current.turn();
        gameRef.current.move(moveData);
        setGame(gameRef.current);
        applyIncrement(prevTurn);
        switchActiveColor();
        startClock();

        setTimeout(() => {
          if (gameRef.current.isGameOver()) {

            stopClock();
            setGameOver(true);

            let message;
            if (gameRef.current.isCheckmate()) {
              message = `Checkmate! ${gameRef.current.turn() === 'w' ? 'Black' : 'White'} wins!`;
            } else if (gameRef.current.isDraw()) {
              message = "Draw!";
            } else {
              message = "Game Over";
            }

            alert("Game Over", message, [
              { text: "Ok", onPress: () => { }, style: "default" }
            ]);
          } else {


          }
        }, 350);

        const response = await fetch(`${serverURL}/playermove?playerID=${playerIDRef.current}&move=${moveData}`);
        if (response.ok) {
          console.log(await response.text());
        } else {
          console.error('Failed to make move on backend. Status Code:', response.status);
        }
      }
      else {
        console.error('Failed to find best move. Status Code:', moveResponse.status);
      }
    } catch (error) {
      console.error('Error getting engine move:', error);
    }
  };

  const onDrop = (sourceSquare: Square, targetSquare: Square, piece: Piece) => {
    if (gameOverRef.current) return false;

    // Check if it's player's turn
    const pieceColor = piece[0].toLowerCase();
    if ((playerColorRef.current === "white" && pieceColor !== "w") || (playerColorRef.current === "black" && pieceColor !== "b")) {
      return false;
    }

    try {
      stopClock();
      const prevTurn = gameRef.current.turn();

      const move = gameRef.current.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: piece[1].toLowerCase() === "p" ? "q" : undefined
      });

      setGame(gameRef.current);

      if (!move) return false;

      applyIncrement(prevTurn);
      switchActiveColor();

      fetch(`${serverURL}/playermove?playerID=${playerIDRef.current}&move=${move.lan}`)
        .then(response => {
          if (response.ok) {
            console.log(response.text());
          } else {
            throw new Error('Failed to make move on backend. Status Code: ' + response.status + " " + response.statusText + " move: " + move.lan);
          }
        })
        .catch(error => {
          console.error(error); // Log any errors that occurred during the fetch
        });

      if (checkGameOver()) {
        return true;
      }

      startClock();

      // After player move, request engine move
      setTimeout(engineMove, 500);

      return true;
    } catch (error) {
      console.error('Error making move:', error);
      return false;
    }
  };

  // New function: Handle flipping the board without starting a new game
  const handleFlipBoard = () => {
    setBoardOrientation(prevOrientation => prevOrientation === "white" ? "black" : "white");
  };

  // Play as white function - now only sets color and starts a new game
  const handlePlayAsWhite = async () => {
    await resetGame();
    setPlayerColor("white");
    setBoardOrientation("white");
    setActiveColor("w");
    startClock();
  };

  // Play as black function - now only sets color and starts a new game
  const handlePlayAsBlack = async () => {
    await resetGame();
    setPlayerColor("black");
    setBoardOrientation("black");
    setActiveColor("w");
    startClock();
    // Since player is black, engine (white) moves first
    setTimeout(engineMove, 500);
  };

  // New function: Start a new game with current player color
  const handleNewGame = async () => {
    resetGame();
    // Keep the current player color based on board orientation
    const currentPlayerColor = boardOrientation === "white" ? "white" : "black";
    setPlayerColor(currentPlayerColor);
    setActiveColor("w");
    startClock();

    // If player is black, engine (white) moves first
    if (currentPlayerColor === "black") {
      setTimeout(engineMove, 500);
    }
  };

  const resetGame = async () => {
    stopClock();
    const newGame = new Chess();
    setGame(newGame);
    setGameOver(false);

    // Reset clock times
    const seconds = parseFloat(timeControl) * 60;
    setWhiteTime(seconds);
    setBlackTime(seconds);

    await endGame();
    await getNewGame();
  };

  const handleResign = () => {
    if (gameOverRef.current) return;

    stopClock();

    alert("Game Over", `You resigned. ${playerColorRef.current === "white" ? "Black" : "White"} wins!`, [
      { text: "Ok", onPress: () => setGameOver(true), style: "default" },
      { text: "Cancel", onPress: () => startClock(), style: "cancel" }
    ]);
  };

  const handleLoadPosition = async () => {
    if (!fenInput) {
      alert("Invalid FEN", "Please enter a valid FEN string.", [
        { text: "Ok", onPress: () => { }, style: "default" }
      ]);
      return;
    }

    stopClock();
    const loadedGame = new Chess(fenInput);
    setGame(loadedGame);
    setGameOver(false);
    // setActiveColor(loadedGame.turn());

    await endGame();

    try {
      // Send the POST request to the server
      const response = await fetch(`${serverURL}/newgame`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: `fen ${loadedGame.fen()}`,
      });

      if (response.ok) {
        const data = await response.json();
        setPlayerID(data.playerID);
        playerIDRef.current = data.playerID;
        console.log('PlayerID received:', data.playerID);

        const newPlayerColor = boardOrientation === "white" ? "white" : "black";
        setPlayerColor(newPlayerColor);
        // setBoardOrientation(newPlayerColor);
        setActiveColor(loadedGame.turn());
        startClock();

        if (newPlayerColor !== (loadedGame.turn() === "w" ? "white" : "black")) {
          setTimeout(engineMove, 500);
        }
      } else {
        console.error("Failed to create game. Status code: " + response.status);
      }
    } catch (error) {
      console.error('Error creating game:', error);
    }
  };

  const handleTimeControlChange = (value: string) => {
    if (/^\d*\.?\d*$/.test(value)) {
      setTimeControl(value);
    }
  };

  const handleIncrementChange = (value: string) => {
    if (/^\d*\.?\d*$/.test(value)) {
      setIncrement(value);
    }
  };

  const checkGameOver = () => {
    if (gameRef.current.isGameOver()) {
      stopClock();
      setGameOver(true);

      let message;
      if (gameRef.current.isCheckmate()) {
        message = `Checkmate! ${gameRef.current.turn() === 'w' ? 'Black' : 'White'} wins!`;
      } else if (gameRef.current.isDraw()) {
        message = "Draw!";
      } else {
        message = "Game Over";
      }

      alert("Game Over", message, [
        { text: "Ok", onPress: () => { }, style: "default" }
      ]);

      return true;
    }
    return false;
  };

  // Format time for display (mm:ss)
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate board size based on screen dimensions
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;
  const boardSize = Math.min(screenWidth - 40, screenHeight * 0.6);

  // Determine which clock goes on top based on board orientation
  const isWhiteOnBottom = boardOrientation === "white";

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <View style={styles.container}>
        {/* Top controls - limited to board width */}
        <View style={[styles.topControlsContainer, { width: boardSize }]}>
          <View style={styles.buttonRow}>
            <Button title="Play as White" onPress={handlePlayAsWhite} />
            <Button title="New Game" onPress={handleNewGame} />
            <Button title="Play as Black" onPress={handlePlayAsBlack} />
          </View>
          <View style={styles.buttonRow}>
            <Button title="Flip Board" onPress={handleFlipBoard} />
            <Button title="Resign" onPress={handleResign} />
          </View>
        </View>

        {/* Chessboard with clocks */}
        <View style={styles.boardContainer}>
          {/* Top clock (depends on board orientation) */}
          <View style={[styles.clockContainer, styles.topClock, { width: boardSize }]}>
            <Text style={styles.clockLabel}>{isWhiteOnBottom ? "Black" : "White"}</Text>
            <Text style={[
              styles.clockTime,
              activeColor === (isWhiteOnBottom ? "b" : "w") && isClockRunning && styles.activeClock,
              (isWhiteOnBottom ? blackTime : whiteTime) < 30 && styles.lowTime
            ]}>
              {formatTime(isWhiteOnBottom ? blackTime : whiteTime)}
            </Text>
          </View>

          {/* The actual chessboard */}
          <View style={styles.boardWrapper}>
            <Chessboard
              position={gameRef.current.fen()}
              onPieceDrop={onDrop}
              boardWidth={boardSize}
              boardOrientation={boardOrientation == "white" ? "white" : "black"}
            />
          </View>

          {/* Bottom clock (depends on board orientation) */}
          <View style={[styles.clockContainer, styles.bottomClock, { width: boardSize }]}>
            <Text style={styles.clockLabel}>{isWhiteOnBottom ? "White" : "Black"}</Text>
            <Text style={[
              styles.clockTime,
              activeColor === (isWhiteOnBottom ? "w" : "b") && isClockRunning && styles.activeClock,
              (isWhiteOnBottom ? whiteTime : blackTime) < 30 && styles.lowTime
            ]}>
              {formatTime(isWhiteOnBottom ? whiteTime : blackTime)}
            </Text>
          </View>
        </View>

        {/* Time control inputs */}
        <View style={[styles.timeControlContainer, { width: boardSize }]}>
          <View style={styles.timeControlRow}>
            <View style={styles.timeControlField}>
              <Text style={styles.label}>Time (minutes)</Text>
              <TextInput
                style={styles.input}
                value={timeControl}
                onChangeText={handleTimeControlChange}
                keyboardType="numeric"
                placeholder="Time in minutes"
              />
            </View>

            <View style={styles.timeControlField}>
              <Text style={styles.label}>Increment (seconds)</Text>
              <TextInput
                style={styles.input}
                value={increment}
                onChangeText={handleIncrementChange}
                keyboardType="numeric"
                placeholder="Increment in seconds"
              />
            </View>
          </View>
        </View>

        {/* Bottom controls - limited to board width */}
        <View style={[styles.bottomControlsContainer, { width: boardSize }]}>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.fenInput}
              value={fenInput}
              onChangeText={setFenInput}
              placeholder="Enter FEN String"
            />
            <Button title="Load" onPress={handleLoadPosition} />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f4f4f4',
    padding: 20,
  },
  topControlsContainer: {
    marginBottom: 10,
  },
  bottomControlsContainer: {
    marginTop: 15,
  },
  timeControlContainer: {
    marginTop: 15,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeControlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeControlField: {
    flex: 1,
    marginHorizontal: 5,
  },
  label: {
    marginBottom: 5,
    fontWeight: '500',
  },
  input: {
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
  },
  fenInput: {
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    flex: 1,
    marginRight: 10,
  },
  boardContainer: {
    alignItems: 'center',
  },
  boardWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  clockContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#e0e0e0',
    borderRadius: 5,
    marginVertical: 5,
  },
  topClock: {
    marginBottom: 5,
  },
  bottomClock: {
    marginTop: 5,
  },
  clockLabel: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  clockTime: {
    fontSize: 18,
    fontWeight: '500',
    fontFamily: 'monospace',
  },
  activeClock: {
    color: '#2196F3',
    fontWeight: 'bold',
  },
  lowTime: {
    color: '#F44336',
    fontWeight: 'bold',
  },
});