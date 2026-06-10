// Upgraded Samsung Tizen TV App - Telugu IPTV Pro
(function() {
  const { useState, useEffect, useRef, useCallback, useMemo } = React;

  // ---------- M3U Parser ----------
  function parseM3U(content) {
    const lines = content.split(/\r?\n/);
    const channels = [];
    let currentExtinf = null;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (line.startsWith('#EXTINF')) {
        const logoMatch = line.match(/tvg-logo="([^"]*)"/);
        const groupMatch = line.match(/group-title="([^"]*)"/);
        const tvgIdMatch = line.match(/tvg-id="([^"]*)"/);
        const nameMatch = line.match(/#EXTINF:[^,]*,?(.*)$/);
        const name = nameMatch ? nameMatch[1].trim() : 'Unknown';
        const logo = logoMatch ? logoMatch[1] : null;
        const group = groupMatch ? groupMatch[1] : 'General';
        const epgId = tvgIdMatch ? tvgIdMatch[1] : null;
        currentExtinf = { name, logo, group, url: null, epgId };
      } else if (line && !line.startsWith('#') && currentExtinf) {
        currentExtinf.url = line;
        if (currentExtinf.url.startsWith('http')) channels.push({ ...currentExtinf });
        currentExtinf = null;
      }
    }
    return channels;
  }

  // Fallback Telugu channels with mock EPG data
  const FALLBACK_CHANNELS = [
    { name: "ETV Telugu", logo: "https://i.imgur.com/SYjFh2k.png", group: "Entertainment", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", epgId: "etv" },
    { name: "Gemini TV", logo: "https://i.imgur.com/6Z1l2XO.png", group: "Entertainment", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", epgId: "gemini" },
    { name: "TV9 Telugu", logo: "https://i.imgur.com/PcXWy9R.png", group: "News", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", epgId: "tv9" },
    { name: "Maa TV", logo: "https://i.imgur.com/UhDsKxM.png", group: "Entertainment", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", epgId: "maa" },
    { name: "Zee Telugu", logo: "https://i.imgur.com/wxJQP0f.png", group: "Entertainment", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", epgId: "zee" },
    { name: "V6 News", logo: "https://i.imgur.com/3t2SYU6.png", group: "News", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", epgId: "v6" }
  ];

  // Mock EPG data (replace with real XMLTV fetch)
  const MOCK_EPG = {
    "etv": { now: "🎬 Blockbuster Movie", next: "🎤 Comedy Show" },
    "gemini": { now: "📰 Evening News", next: "📺 Drama Series" },
    "tv9": { now: "🔥 Breaking News", next: "📢 Political Debate" },
    "maa": { now: "🎶 Music Countdown", next: "🎭 Reality Show" },
    "zee": { now: "🍿 Talk Show", next: "📽️ Movie Premiere" },
    "v6": { now: "🌍 World News", next: "💬 Interview" }
  };

  // Helper: store/load from localStorage
  const storage = {
    get: (key, def) => { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; },
    set: (key, val) => localStorage.setItem(key, JSON.stringify(val))
  };

  // Main App Component
  const App = () => {
    const [channels, setChannels] = useState([]);
    const [filteredChannels, setFilteredChannels] = useState([]);
    const [categories, setCategories] = useState(['All']);
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [activeChannel, setActiveChannel] = useState(null);
    const [loading, setLoading] = useState(true);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [playerError, setPlayerError] = useState(false);
    const [useNativeFallback, setUseNativeFallback] = useState(false);
    const [isPlaying, setIsPlaying] = useState(true);
    const [volume, setVolume] = useState(() => storage.get('volume', 0.7));
    const [favorites, setFavorites] = useState(() => storage.get('favorites', []));
    const [searchTerm, setSearchTerm] = useState('');
    const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
    const [toast, setToast] = useState(null);
    const [epgNow, setEpgNow] = useState('');
    const [retryCount, setRetryCount] = useState(0);

    const videoRef = useRef(null);
    const shakaPlayerRef = useRef(null);
    const nativeVideoRef = useRef(null);

    // Show temporary message
    const showToast = (msg, duration = 2000) => {
      setToast(msg);
      setTimeout(() => setToast(null), duration);
    };

    // Fetch playlist
    useEffect(() => {
      const fetchPlaylist = async () => {
        try {
          setLoading(true);
          const m3uUrl = 'https://raw.githubusercontent.com/iptv-org/iptv/master/playlists/telugu.m3u';
          const response = await fetch(m3uUrl);
          if (!response.ok) throw new Error();
          const m3uText = await response.text();
          let parsed = parseM3U(m3uText).filter(ch => ch.url && ch.url.startsWith('http'));
          if (parsed.length === 0) throw new Error();
          setChannels(parsed);
          const cats = ['All', ...new Set(parsed.map(ch => ch.group).filter(Boolean))];
          setCategories(cats);
        } catch (err) {
          console.warn('Using fallback');
          setChannels(FALLBACK_CHANNELS);
          setCategories(['All', 'Entertainment', 'News']);
        } finally {
          setLoading(false);
        }
      };
      fetchPlaylist();
    }, []);

    // Load last watched channel from storage
    useEffect(() => {
      if (channels.length > 0) {
        const lastUrl = storage.get('lastChannelUrl', null);
        const lastChannel = channels.find(ch => ch.url === lastUrl) || channels[0];
        setActiveChannel(lastChannel);
      }
    }, [channels]);

    // Save last channel
    useEffect(() => {
      if (activeChannel) storage.set('lastChannelUrl', activeChannel.url);
    }, [activeChannel]);

    // Save favorites
    useEffect(() => {
      storage.set('favorites', favorites);
    }, [favorites]);

    // Filter by category, search, favorites
    useEffect(() => {
      let result = channels;
      if (selectedCategory !== 'All') result = result.filter(ch => ch.group === selectedCategory);
      if (searchTerm) result = result.filter(ch => ch.name.toLowerCase().includes(searchTerm.toLowerCase()));
      if (showFavoritesOnly) result = result.filter(ch => favorites.includes(ch.url));
      setFilteredChannels(result);
    }, [selectedCategory, channels, searchTerm, showFavoritesOnly, favorites]);

    // Update EPG for active channel
    useEffect(() => {
      if (activeChannel && activeChannel.epgId && MOCK_EPG[activeChannel.epgId]) {
        setEpgNow(`${MOCK_EPG[activeChannel.epgId].now} | Next: ${MOCK_EPG[activeChannel.epgId].next}`);
      } else {
        setEpgNow('Live stream (no EPG)');
      }
    }, [activeChannel]);

    // Shaka Player with auto retry
    const initPlayer = useCallback(async () => {
      if (!activeChannel || !videoRef.current) return;
      const videoEl = videoRef.current;
      videoEl.volume = volume;
      try {
        if (shakaPlayerRef.current) {
          shakaPlayerRef.current.destroy();
          shakaPlayerRef.current = null;
        }
        const player = new shaka.Player(videoEl);
        shakaPlayerRef.current = player;
        await player.load(activeChannel.url);
        setPlayerError(false);
        setUseNativeFallback(false);
        setIsPlaying(true);
        videoEl.play().catch(e => console.warn);
        setRetryCount(0);
      } catch (err) {
        console.error('Shaka error', err);
        if (retryCount < 2) {
          setRetryCount(prev => prev + 1);
          setTimeout(() => initPlayer(), 1000);
        } else {
          setPlayerError(true);
          setUseNativeFallback(true);
        }
      }
    }, [activeChannel, volume, retryCount]);

    useEffect(() => {
      if (activeChannel && !useNativeFallback) initPlayer();
    }, [activeChannel, initPlayer, useNativeFallback]);

    useEffect(() => {
      if (useNativeFallback && activeChannel && nativeVideoRef.current) {
        const nativeVideo = nativeVideoRef.current;
        nativeVideo.src = activeChannel.url;
        nativeVideo.volume = volume;
        nativeVideo.load();
        nativeVideo.play().catch(e => console.warn);
        setIsPlaying(true);
      }
    }, [useNativeFallback, activeChannel, volume]);

    // Play/Pause
    const togglePlayPause = () => {
      const video = useNativeFallback ? nativeVideoRef.current : videoRef.current;
      if (!video) return;
      if (video.paused) {
        video.play();
        setIsPlaying(true);
        showToast('▶️ Playing');
      } else {
        video.pause();
        setIsPlaying(false);
        showToast('⏸ Paused');
      }
    };

    // Volume control
    const changeVolume = (newVol) => {
      const vol = Math.min(1, Math.max(0, newVol));
      setVolume(vol);
      storage.set('volume', vol);
      const video = useNativeFallback ? nativeVideoRef.current : videoRef.current;
      if (video) video.volume = vol;
      showToast(`🔊 Volume ${Math.round(vol * 100)}%`);
    };

    // Channel up/down
    const nextChannel = (delta) => {
      if (filteredChannels.length === 0) return;
      const currentIndex = filteredChannels.findIndex(ch => ch.url === activeChannel?.url);
      let newIndex = currentIndex + delta;
      if (newIndex < 0) newIndex = filteredChannels.length - 1;
      if (newIndex >= filteredChannels.length) newIndex = 0;
      setActiveChannel(filteredChannels[newIndex]);
      showToast(`📺 ${filteredChannels[newIndex].name}`);
    };

    // Toggle favorite
    const toggleFavorite = (channel) => {
      if (favorites.includes(channel.url)) {
        setFavorites(favorites.filter(f => f !== channel.url));
        showToast(`⭐ Removed from favorites`);
      } else {
        setFavorites([...favorites, channel.url]);
        showToast(`❤️ Added to favorites`);
      }
    };

    // Keyboard/remote event handling
    useEffect(() => {
      const handleKey = (e) => {
        const key = e.key;
        switch (key) {
          case 'ArrowUp': e.preventDefault(); break;
          case 'ArrowDown': e.preventDefault(); break;
          case 'ArrowLeft': e.preventDefault(); break;
          case 'ArrowRight': e.preventDefault(); break;
          case 'Enter': e.preventDefault(); break;
          case 'MediaPlayPause': togglePlayPause(); break;
          case 'MediaPlay': if (!isPlaying) togglePlayPause(); break;
          case 'MediaPause': if (isPlaying) togglePlayPause(); break;
          case 'ArrowUp': changeVolume(volume + 0.05); break;
          case 'ArrowDown': changeVolume(volume - 0.05); break;
          case 'ArrowLeft': nextChannel(-1); break;
          case 'ArrowRight': nextChannel(1); break;
          case 'f': case 'F': if (activeChannel) toggleFavorite(activeChannel); break;
          case 's': case 'S': setSettingsOpen(prev => !prev); break;
          case 'Escape': if (settingsOpen) setSettingsOpen(false); break;
          default: break;
        }
      };
      window.addEventListener('keydown', handleKey);
      return () => window.removeEventListener('keydown', handleKey);
    }, [volume, isPlaying, activeChannel, filteredChannels, settingsOpen]);

    if (loading) return <LoadingSkeleton />;

    return (
      <div className="relative h-full w-full flex flex-col bg-gradient-to-b from-gray-900 to-black">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-3 bg-black/40 backdrop-blur-sm z-10">
          <div className="flex items-center gap-3">
            <div className="text-3xl">📺</div>
            <h1 className="text-xl font-bold tracking-wide text-orange-400">Telugu IPTV Pro</h1>
            <span className="text-xs bg-gray-800 px-2 py-1 rounded-full">Tizen 9</span>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowFavoritesOnly(!showFavoritesOnly)} className={`p-2 rounded-full ${showFavoritesOnly ? 'bg-orange-600' : 'bg-gray-800'}`}>⭐ {showFavoritesOnly ? 'Favorites' : 'All'}</button>
            <button onClick={toggleSettings} className="bg-gray-800 p-2 rounded-full">⚙️</button>
          </div>
        </div>

        {/* Main layout */}
        <div className="flex flex-1 min-h-0 overflow-hidden px-4 gap-4">
          {/* Left Categories + Search */}
          <div className="w-64 flex-shrink-0 bg-gray-900/60 rounded-2xl p-3 overflow-y-auto custom-scroll">
            <input type="text" placeholder="🔍 Search channels..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-gray-800 rounded p-2 mb-3 text-sm" />
            <h2 className="text-lg font-semibold mb-3 text-orange-300">Categories</h2>
            <div className="space-y-2">
              {categories.map(cat => (
                <button key={cat} onClick={() => setSelectedCategory(cat)} className={`w-full text-left px-3 py-2 rounded-xl ${selectedCategory === cat ? 'bg-orange-600' : 'bg-gray-800/70 hover:bg-gray-700'}`}>{cat}</button>
              ))}
            </div>
            <div className="mt-6 text-xs text-gray-400 text-center">📡 {channels.length} channels<br/>⭐ {favorites.length} favorites</div>
          </div>

          {/* Player box (shifted right) */}
          <div className="flex-1 flex justify-end items-start p-1">
            <div className="w-[75%] max-w-4xl bg-black rounded-2xl shadow-2xl border border-gray-700">
              <div className="relative pt-[56.25%] bg-black">
                {!useNativeFallback ? (
                  <video ref={videoRef} className="absolute top-0 left-0 w-full h-full object-contain" autoPlay playsInline />
                ) : (
                  <video ref={nativeVideoRef} className="absolute top-0 left-0 w-full h-full object-contain" autoPlay playsInline />
                )}
                <div className="absolute bottom-2 left-3 bg-black/60 text-xs px-2 py-1 rounded">{activeChannel?.name} | {epgNow}</div>
                <div className="absolute top-2 right-2 bg-black/60 p-1 rounded text-xs flex gap-2">
                  <button onClick={() => toggleFavorite(activeChannel)} className="focus:outline-none">{favorites.includes(activeChannel?.url) ? '❤️' : '🤍'}</button>
                  <button onClick={togglePlayPause}>{isPlaying ? '⏸' : '▶️'}</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom channel row */}
        <div className="w-full px-4 pb-6 pt-2">
          <div className="overflow-x-auto custom-scroll">
            <div className="flex gap-3 pb-2">
              {filteredChannels.map((ch, idx) => (
                <button key={idx} onClick={() => setActiveChannel(ch)} className={`channel-card flex-shrink-0 w-32 bg-gray-800/80 rounded-xl p-2 flex flex-col items-center ${activeChannel?.url === ch.url ? 'active-channel' : ''}`}>
                  <div className="w-12 h-12 bg-gray-700 rounded-full flex items-center justify-center mb-1">
                    {ch.logo ? <img src={ch.logo} className="w-full h-full object-contain" onError={e => e.target.src = ''} /> : <span>📡</span>}
                  </div>
                  <span className="text-xs truncate w-full">{ch.name}</span>
                  {favorites.includes(ch.url) && <span className="text-[10px] text-yellow-400">⭐</span>}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Settings panel */}
        <div className={`fixed inset-y-0 right-0 w-80 bg-gray-900 shadow-2xl transform transition-transform duration-300 ${settingsOpen ? 'translate-x-0' : 'translate-x-full'} z-50`}>
          <div className="p-4">
            <div className="flex justify-between"><h2 className="text-orange-400 text-xl">Settings</h2><button onClick={() => setSettingsOpen(false)}>✖️</button></div>
            <div className="mt-4 space-y-4">
              <div><label>Volume: {Math.round(volume*100)}%</label><input type="range" min="0" max="1" step="0.01" value={volume} onChange={e => changeVolume(parseFloat(e.target.value))} className="w-full" /></div>
              <div><button onClick={() => { storage.set('favorites', []); setFavorites([]); showToast('Favorites cleared'); }} className="bg-red-800 p-2 rounded w-full">Clear Favorites</button></div>
              <div className="text-xs text-gray-400 text-center">Remote: ⬅️➡️ change channel<br/>⬆️⬇️ volume | ⏯️ play/pause | F favorite | S settings</div>
            </div>
          </div>
        </div>
        {settingsOpen && <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setSettingsOpen(false)}></div>}
        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  };

  const LoadingSkeleton = () => (
    <div className="flex items-center justify-center h-full w-full bg-black">
      <div className="text-center"><div className="animate-spin rounded-full h-16 w-16 border-t-4 border-orange-500 mb-4"></div><p>Loading Telugu IPTV...</p></div>
    </div>
  );

  ReactDOM.render(React.createElement(App), document.getElementById('root'));
})();