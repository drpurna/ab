(function() {
  const { useState, useEffect, useRef, useCallback } = React;

  // ---------- M3U Parser ----------
  function parseM3U(content) {
    const lines = content.split(/\r?\n/);
    const channels = [];
    let current = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#EXTINF')) {
        const logoMatch = line.match(/tvg-logo="([^"]*)"/);
        const groupMatch = line.match(/group-title="([^"]*)"/);
        const nameMatch = line.match(/#EXTINF:[^,]*,?(.*)$/);
        const name = nameMatch ? nameMatch[1].trim() : 'Unknown';
        const logo = logoMatch ? logoMatch[1] : null;
        const group = groupMatch ? groupMatch[1] : 'General';
        current = { name, logo, group, url: null };
      } else if (line && !line.startsWith('#') && current) {
        current.url = line;
        if (current.url.startsWith('http')) channels.push({ ...current });
        current = null;
      }
    }
    return channels;
  }

  // Fallback channels (if playlist fetch fails)
  const FALLBACK_CHANNELS = [
    { name: "ETV Telugu", logo: "https://i.imgur.com/SYjFh2k.png", group: "Entertainment", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
    { name: "Gemini TV", logo: "https://i.imgur.com/6Z1l2XO.png", group: "Entertainment", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
    { name: "TV9 Telugu", logo: "https://i.imgur.com/PcXWy9R.png", group: "News", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" }
  ];

  const App = () => {
    const [channels, setChannels] = useState([]);
    const [categories, setCategories] = useState(['All']);
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [activeChannel, setActiveChannel] = useState(null);
    const [loading, setLoading] = useState(true);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [useNativeFallback, setUseNativeFallback] = useState(false);
    
    const videoRef = useRef(null);
    const shakaRef = useRef(null);
    const nativeRef = useRef(null);

    // Fetch Telugu playlist from GitHub IPTV org
    useEffect(() => {
      const fetchPlaylist = async () => {
        try {
          const url = 'https://raw.githubusercontent.com/iptv-org/iptv/master/playlists/telugu.m3u';
          const res = await fetch(url);
          if (!res.ok) throw new Error();
          const text = await res.text();
          let parsed = parseM3U(text).filter(ch => ch.url && ch.url.startsWith('http'));
          if (parsed.length === 0) throw new Error();
          setChannels(parsed);
          const cats = ['All', ...new Set(parsed.map(ch => ch.group).filter(Boolean))];
          setCategories(cats);
          setActiveChannel(parsed[0]);
        } catch (err) {
          console.warn('Fallback to local channels', err);
          setChannels(FALLBACK_CHANNELS);
          setCategories(['All', 'Entertainment', 'News']);
          setActiveChannel(FALLBACK_CHANNELS[0]);
        } finally {
          setLoading(false);
        }
      };
      fetchPlaylist();
    }, []);

    // Filter channels by category
    const filteredChannels = selectedCategory === 'All' 
      ? channels 
      : channels.filter(ch => ch.group === selectedCategory);

    // Shaka Player with fallback
    const initShaka = useCallback(async () => {
      if (!activeChannel || !videoRef.current) return;
      const video = videoRef.current;
      try {
        if (shakaRef.current) shakaRef.current.destroy();
        const player = new shaka.Player(video);
        shakaRef.current = player;
        await player.load(activeChannel.url);
        setUseNativeFallback(false);
        video.play().catch(e => console.warn);
      } catch (err) {
        console.error('Shaka error, using native fallback', err);
        setUseNativeFallback(true);
      }
    }, [activeChannel]);

    useEffect(() => {
      if (activeChannel && !useNativeFallback) initShaka();
    }, [activeChannel, initShaka, useNativeFallback]);

    useEffect(() => {
      if (useNativeFallback && activeChannel && nativeRef.current) {
        const vid = nativeRef.current;
        vid.src = activeChannel.url;
        vid.load();
        vid.play().catch(e => console.warn);
      }
    }, [useNativeFallback, activeChannel]);

    if (loading) {
      return (
        <div className="flex items-center justify-center h-full w-full bg-black">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-orange-500 mx-auto mb-4"></div>
            <p>Loading Telugu channels...</p>
          </div>
        </div>
      );
    }

    return (
      <div className="relative h-full w-full flex flex-col bg-gradient-to-b from-gray-900 to-black">
        {/* Header with icon */}
        <div className="flex justify-between items-center px-6 py-3 bg-black/40 backdrop-blur-sm z-10">
          <div className="flex items-center gap-3">
            <div className="text-3xl">📺</div>
            <h1 className="text-xl font-bold text-orange-400">Telugu IPTV</h1>
            <span className="text-xs bg-gray-800 px-2 py-1 rounded-full">Tizen 9</span>
          </div>
          <button 
            onClick={() => setSettingsOpen(true)} 
            className="bg-gray-800 p-2 rounded-full hover:bg-gray-700"
          >
            ⚙️
          </button>
        </div>

        {/* Main content: left categories + right player */}
        <div className="flex flex-1 min-h-0 overflow-hidden px-4 gap-4 mt-2">
          {/* Vertical categories (left) */}
          <div className="w-64 flex-shrink-0 bg-gray-900/60 rounded-2xl p-3 overflow-y-auto custom-scroll">
            <h2 className="text-lg font-semibold mb-3 text-orange-300 border-l-4 border-orange-500 pl-2">
              Categories
            </h2>
            <div className="space-y-2">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`w-full text-left px-3 py-2 rounded-xl transition ${
                    selectedCategory === cat 
                      ? 'bg-orange-600 text-white' 
                      : 'bg-gray-800/70 hover:bg-gray-700'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="mt-6 text-xs text-gray-400 text-center">
              {channels.length} channels
            </div>
          </div>

          {/* Player box - shifted toward right */}
          <div className="flex-1 flex justify-end items-start">
            <div className="w-[75%] max-w-4xl bg-black rounded-xl shadow-2xl border border-gray-700 overflow-hidden">
              <div className="relative pt-[56.25%] bg-black">
                {!useNativeFallback ? (
                  <video
                    ref={videoRef}
                    className="absolute top-0 left-0 w-full h-full object-contain"
                    autoPlay
                    playsInline
                  />
                ) : (
                  <video
                    ref={nativeRef}
                    className="absolute top-0 left-0 w-full h-full object-contain"
                    autoPlay
                    playsInline
                  />
                )}
                <div className="absolute bottom-2 left-3 bg-black/60 text-xs px-2 py-1 rounded">
                  {activeChannel?.name || 'No channel'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom single row: channel cards with logos */}
        <div className="w-full px-4 pb-6 pt-2">
          <div className="overflow-x-auto custom-scroll">
            <div className="flex gap-3 pb-2">
              {filteredChannels.map((channel, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveChannel(channel)}
                  className={`flex-shrink-0 w-32 bg-gray-800/80 rounded-xl p-2 flex flex-col items-center text-center transition hover:bg-gray-700 ${
                    activeChannel?.url === channel.url ? 'channel-card active' : ''
                  }`}
                >
                  <div className="w-12 h-12 bg-gray-700 rounded-full flex items-center justify-center mb-1 overflow-hidden">
                    {channel.logo ? (
                      <img 
                        src={channel.logo} 
                        alt={channel.name} 
                        className="w-full h-full object-contain"
                        onError={(e) => e.target.style.display = 'none'}
                      />
                    ) : (
                      <span className="text-2xl">📡</span>
                    )}
                  </div>
                  <span className="text-xs font-medium truncate w-full">{channel.name}</span>
                  <span className="text-[10px] text-gray-400">{channel.group}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Settings panel sliding from right */}
        <div className={`fixed inset-y-0 right-0 w-80 bg-gray-900 shadow-2xl transform transition-transform duration-300 z-50 ${
          settingsOpen ? 'translate-x-0' : 'translate-x-full'
        }`}>
          <div className="flex flex-col h-full">
            <div className="flex justify-between items-center p-4 border-b border-gray-700">
              <h2 className="text-xl font-bold text-orange-400">Settings</h2>
              <button 
                onClick={() => setSettingsOpen(false)} 
                className="text-2xl text-gray-400 hover:text-white"
              >
                ×
              </button>
            </div>
            <div className="p-4 space-y-4 flex-1">
              <div>
                <p className="text-sm text-gray-300 mb-2">Player</p>
                <p className="text-xs text-gray-400">
                  {useNativeFallback ? 'Native (Fallback)' : 'Shaka Player'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-300 mb-2">Playlist</p>
                <p className="text-xs text-gray-400">GitHub IPTV Org - Telugu</p>
              </div>
              <div className="absolute bottom-4 left-4 right-4 text-center text-xs text-gray-500">
                © Telugu IPTV • Samsung Tizen
              </div>
            </div>
          </div>
        </div>
        
        {/* Overlay */}
        {settingsOpen && (
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setSettingsOpen(false)}></div>
        )}
      </div>
    );
  };

  // Render app
  const root = document.getElementById('root');
  if (root) {
    ReactDOM.render(React.createElement(App), root);
  }
})();