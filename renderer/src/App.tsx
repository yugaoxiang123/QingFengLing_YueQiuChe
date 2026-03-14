import React, { useState, useEffect, useCallback, useRef } from 'react';

interface Position {
  x: number;
  y: number;
}

interface RoverState {
  position: Position;
  rotation: number;
  hasCargo: boolean;
  isCollecting: boolean;
  isUnloading: boolean;
}

interface Rock {
  id: number;
  position: Position;
  size: number;
  isCollectible: boolean;
  collected: boolean;
}

const App: React.FC = () => {
  const [rover, setRover] = useState<RoverState>({
    position: { x: 100, y: 100 },
    rotation: 0,
    hasCargo: false,
    isCollecting: false,
    isUnloading: false
  });

  const [rocks, setRocks] = useState<Rock[]>([]);
  const [targetZone] = useState<Position>({ x: 600, y: 400 });
  const [gameStatus, setGameStatus] = useState<'playing' | 'success'>('playing');
  const [score, setScore] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const keysPressed = useRef<Set<string>>(new Set());

  // 初始化音频上下文
  useEffect(() => {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioContextRef.current = new AudioContextClass();
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // 生成随机月壤
  useEffect(() => {
    const generateRocks = () => {
      const newRocks: Rock[] = [];
      for (let i = 0; i < 8; i++) {
        newRocks.push({
          id: i,
          position: {
            x: Math.random() * (window.innerWidth - 100) + 50,
            y: Math.random() * (window.innerHeight - 100) + 50
          },
          size: Math.random() * 30 + 20,
          isCollectible: Math.random() > 0.5,
          collected: false
        });
      }
      setRocks(newRocks);
    };
    generateRocks();
  }, []);

  // 播放音效
  const playSound = useCallback((frequency: number, duration: number, type: 'sine' | 'square' | 'sawtooth' = 'sine') => {
    if (!audioContextRef.current) return;

    const oscillator = audioContextRef.current.createOscillator();
    const gainNode = audioContextRef.current.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContextRef.current.destination);

    oscillator.frequency.setValueAtTime(frequency, audioContextRef.current.currentTime);
    oscillator.type = type;

    gainNode.gain.setValueAtTime(0.3, audioContextRef.current.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContextRef.current.currentTime + duration);

    oscillator.start(audioContextRef.current.currentTime);
    oscillator.stop(audioContextRef.current.currentTime + duration);
  }, []);

  // 移动小车
  const moveRover = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    setRover(prev => {
      const speed = 5;
      let newX = prev.position.x;
      let newY = prev.position.y;
      let newRotation = prev.rotation;

      switch (direction) {
        case 'up':
          newY = Math.max(20, prev.position.y - speed);
          newRotation = 0;
          break;
        case 'down':
          newY = Math.min(window.innerHeight - 60, prev.position.y + speed);
          newRotation = 180;
          break;
        case 'left':
          newX = Math.max(20, prev.position.x - speed);
          newRotation = 270;
          break;
        case 'right':
          newX = Math.min(window.innerWidth - 80, prev.position.x + speed);
          newRotation = 90;
          break;
      }

      return {
        ...prev,
        position: { x: newX, y: newY },
        rotation: newRotation
      };
    });
  }, []);

  // 检查是否靠近月壤
  const checkNearRock = useCallback(() => {
    return rocks.find(rock => {
      if (rock.collected || !rock.isCollectible) return false;
      const distance = Math.sqrt(
        Math.pow(rock.position.x - rover.position.x, 2) + 
        Math.pow(rock.position.y - rover.position.y, 2)
      );
      return distance < 80;
    });
  }, [rocks, rover.position]);

  // 检查是否在目标区域
  const checkInTargetZone = useCallback(() => {
    const distance = Math.sqrt(
      Math.pow(targetZone.x - rover.position.x, 2) + 
      Math.pow(targetZone.y - rover.position.y, 2)
    );
    return distance < 100;
  }, [rover.position, targetZone]);

  // 采集月壤
  const collectRock = useCallback(() => {
    if (rover.hasCargo || rover.isCollecting) return;

    const nearbyRock = checkNearRock();
    if (!nearbyRock) return;

    setRover(prev => ({ ...prev, isCollecting: true }));
    playSound(440, 0.5, 'sine'); // 采集音效

    setTimeout(() => {
      setRocks(prev => prev.map(rock => 
        rock.id === nearbyRock.id ? { ...rock, collected: true } : rock
      ));
      setRover(prev => ({ 
        ...prev, 
        hasCargo: true, 
        isCollecting: false 
      }));
      playSound(660, 0.3, 'sine'); // 采集完成音效
    }, 1000);
  }, [rover.hasCargo, rover.isCollecting, checkNearRock, playSound]);

  // 卸货
  const unloadCargo = useCallback(() => {
    if (!rover.hasCargo || rover.isUnloading) return;

    setRover(prev => ({ ...prev, isUnloading: true }));
    playSound(330, 0.5, 'square'); // 卸货音效

    setTimeout(() => {
      const inTargetZone = checkInTargetZone();
      
      setRover(prev => ({ 
        ...prev, 
        hasCargo: false, 
        isUnloading: false 
      }));

      if (inTargetZone) {
        setScore(prev => prev + 100);
        setGameStatus('success');
        playSound(880, 1, 'sine'); // 成功音效
        
        // 发送控制灯带的信号（模拟）
        console.log('发送控制灯带信号：任务成功完成！');
        
        // 3秒后重置游戏
        setTimeout(() => {
          setGameStatus('playing');
          // 重新生成月壤
          const newRocks: Rock[] = [];
          for (let i = 0; i < 8; i++) {
            newRocks.push({
              id: i,
              position: {
                x: Math.random() * (window.innerWidth - 100) + 50,
                y: Math.random() * (window.innerHeight - 100) + 50
              },
              size: Math.random() * 30 + 20,
              isCollectible: Math.random() > 0.5,
              collected: false
            });
          }
          setRocks(newRocks);
        }, 3000);
      } else {
        playSound(220, 0.3, 'square'); // 普通卸货完成音效
      }
    }, 1000);
  }, [rover.hasCargo, rover.isUnloading, checkInTargetZone, playSound]);

  // 键盘控制
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      keysPressed.current.add(key);
      
      // 防止重复触发
      if (event.repeat) return;

      switch (key) {
        case 'Q':
          collectRock();
          break;
        case 'E':
          event.preventDefault();
          unloadCargo();
          break;
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      keysPressed.current.delete(key);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [collectRock, unloadCargo]);

  // 连续移动处理
  useEffect(() => {
    const moveInterval = setInterval(() => {
      if (keysPressed.current.has('arrowup') || keysPressed.current.has('w')) {
        moveRover('up');
      }
      if (keysPressed.current.has('arrowdown') || keysPressed.current.has('s')) {
        moveRover('down');
      }
      if (keysPressed.current.has('arrowleft') || keysPressed.current.has('a')) {
        moveRover('left');
      }
      if (keysPressed.current.has('arrowright') || keysPressed.current.has('d')) {
        moveRover('right');
      }
    }, 50);

    return () => clearInterval(moveInterval);
  }, [moveRover]);

  return (
    <div className="game-container">
      <div className="game-surface">
        {/* 月球表面背景 */}
        <div className="lunar-surface" />
        
        {/* 岩浆区域 */}
        <div 
          className="lava-area"
          style={{
            left: '20%',
            top: '30%',
            width: '200px',
            height: '150px'
          }}
        />
        <div 
          className="lava-area"
          style={{
            left: '70%',
            top: '60%',
            width: '150px',
            height: '120px'
          }}
        />

        {/* 月壤 */}
        {rocks.map(rock => (
          !rock.collected && (
            <div
              key={rock.id}
              className={`moon-rock ${rock.isCollectible ? 'collectible' : ''}`}
              style={{
                left: `${rock.position.x}px`,
                top: `${rock.position.y}px`,
                width: `${rock.size}px`,
                height: `${rock.size}px`
              }}
            />
          )
        ))}

        {/* 目标区域 */}
        <div
          className="target-zone"
          style={{
            left: `${targetZone.x - 50}px`,
            top: `${targetZone.y - 50}px`,
            width: '100px',
            height: '100px'
          }}
        />

        {/* 月壤车 */}
        <div
          className={`rover ${rover.hasCargo ? 'has-cargo' : ''} ${rover.isCollecting ? 'collecting' : ''} ${rover.isUnloading ? 'unloading' : ''}`}
          style={{
            left: `${rover.position.x}px`,
            top: `${rover.position.y}px`,
            transform: `rotate(${rover.rotation}deg)`
          }}
        />

        {/* HUD信息 */}
        <div className="hud">
          <div>月壤车</div>
          <div>得分: {score}</div>
          <div>载货状态: {rover.hasCargo ? '已装载月壤' : '空载'}</div>
          <div>状态: {rover.isCollecting ? '采集中...' : rover.isUnloading ? '卸载中...' : '待命'}</div>
        </div>

        {/* 控制说明 */}
        <div className="controls-info">
          <div>方向键/WASD: 移动小车</div>
          <div>回车键: 采集月壤</div>
          <div>空格键: 卸载月壤</div>
          <div>目标: 将月壤运送到绿色区域</div>
        </div>

        {/* 成功提示 */}
        {gameStatus === 'success' && (
          <div className="success-message">
            <div>任务完成！</div>
            <div style={{ fontSize: '24px', marginTop: '10px' }}>
              月壤已成功运送到指定位置
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
