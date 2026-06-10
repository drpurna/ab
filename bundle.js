// bundle.js - Samsung Tizen TV App (React + Shaka Player + IPTV Telugu Playlist)
(function() {
  const { useState, useEffect, useRef, useCallback } = React;

  // ---------------------- M3U Parser ----------------------
  function parseM3U(content) {
    const lines = content.split(/\r?\n/);
    const channels = [];
    let currentExtinf = null;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (line.startsWith('#EXTINF')) {
        // Extract tvg-logo, group-title, channel name
        const logoMatch = line.match(/tvg-logo="([^"]*)"/);
        const groupMatch = line.match(/group-title="([^"]*)"/);
        const nameMatch = line.match(/#EXTINF:[^,]*,?(.*)$/);
        const name = nameMatch ? nameMatch[1].trim() : 'Unknown Channel';
        const logo = logoMatch ? logoMatch[1] : null;
        const group = groupMatch ? groupMatch[1] : 'General';
        currentExtinf = { name, logo, group, url: null };
      } else if (line && !line.startsWith('#') && currentExtinf) {
        // next line is stream URL
        currentExtinf.url = line;
        if (currentExtinf.url.startsWith('http')) {
          channels.push({ ...currentExtinf });
        }
        currentExtinf = null;
      }
    }
    return channels;
  }

  // Default fallback Telugu channels (in case remote playlist fails)
  const FALLBACK_CHANNELS = [
    { name: "ETV Telugu", logo: "https://i.imgur.com/SYjFh2k.png", group: "Entertainment", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
    { name: "Gemini TV", logo: "https://i.imgur.com/6Z1l2XO.png", group: "Entertainment", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
    { name: "TV9 Telugu", logo: "https://i.imgur.com/PcXWy9R.png", group: "News", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
    { name: "Maa TV", logo: "https://i.imgur.com/UhDsKxM.png", group: "Entertainment", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
    { name: "Zee Telugu", logo: "https://i.imgur.com/wxJQP0f.png", group: "Entertainment", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
    { name: "V6 News", logo: "https://i.imgur.com/3t2SYU6.png", group: "News", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" }
  ];

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
    
    const videoRef = useRef(null);
    const shakaPlayerRef = useRef(null);
    const nativeVideoRef = useRef(null);

    // Fetch playlist from GitHub IPTV org (Telugu)
    useEffect(() => {
      const fetchPlaylist = async () => {
        try {
          setLoading(true);
          const m3uUrl = 'https://raw.githubusercontent.com/iptv-org/iptv/master/playlists/telugu.m3u';
          const response = await fetch(m3uUrl);
          if (!response.ok) throw new Error('Failed to fetch');
          const m3uText = await response.text();
          let parsed = parseM3U(m3uText);
          if (parsed.length === 0) throw new Error('No channels found');
          
          // Filter only channels with valid http url and add missing group
          parsed = parsed.filter(ch => ch.url && ch.url.startsWith('http'));
          if (parsed.length === 0) throw new Error('No valid streams');
          
          setChannels(parsed);
          // Extract unique categories
          const cats = ['All', ...new Set(parsed.map(ch => ch.group || 'General').filter(Boolean))];
          setCategories(cats);
          setFilteredChannels(parsed);
          setActiveChannel(parsed[0]);
        } catch (err) {
          console.warn('Using fallback channels due to:', err);
          setChannels(FALLBACK_CHANNELS);
          const cats = ['All', ...new Set(FALLBACK_CHANNELS.map(ch => ch.group))];
          setCategories(cats);
          setFilteredChannels(FALLBACK_CHANNELS);
          setActiveChannel(FALLBACK_CHANNELS[0]);
        } finally {
          setLoading(false);
        }
      };
      fetchPlaylist();
    }, []);

    // Filter channels by category
    useEffect(() => {
      if (selectedCategory === 'All') {
        setFilteredChannels(channels);
      } else {
        setFilteredChannels(channels.filter(ch => ch.group === selectedCategory));
      }
    }, [selectedCategory, channels]);

    // Shaka Player setup (with fallback to native video)
    useEffect(() => {
      if (!activeChannel || !videoRef.current) return;
      
      const videoEl = videoRef.current;
      let shaka = null;
      
      const initShaka = async () => {
        try {
          if (shakaPlayerRef.current) {
            shakaPlayerRef.current.destroy();
            shakaPlayerRef.current = null;
          }
          shaka = new shaka.Player(videoEl);
          shakaPlayerRef.current = shaka;
          
          await shaka.load(activeChannel.url);
          setPlayerError(false);
          setUseNativeFallback(false);
          videoEl.play().catch(e => console.warn('Autoplay prevented', e));
        } catch (err) {
          console.error('Shaka error, fallback to native HLS', err);
          setPlayerError(true);
          setUseNativeFallback(true);
        }
      };
      
      initShaka();
      
      return () => {
        if (shakaPlayerRef.current) {
          shakaPlayerRef.current.destroy();
          shakaPlayerRef.current = null;
        }
      };
    }, [activeChannel]);
    
    // Native fallback playback (Tizen supports HLS natively)
    useEffect(() => {
      if (!useNativeFallback || !activeChannel || !nativeVideoRef.current) return;
      const nativeVideo = nativeVideoRef.current;
      nativeVideo.src = activeChannel.url;
      nativeVideo.load();
      nativeVideo.play().catch(e => console.warn('Native playback error', e));
      return () => {
        if (nativeVideo) nativeVideo.pause();
      };
    }, [useNativeFallback, activeChannel]);
    
    // Change channel
    const handleChannelSelect = (channel) => {
      if (activeChannel?.url === channel.url) return;
      setActiveChannel(channel);
      setPlayerError(false);
      setUseNativeFallback(false);
    };
    
    // Toggle settings
    const toggleSettings = () => setSettingsOpen(prev => !prev);
    
    // Loading state
    if (loading) {
      return (
        <div className="flex items-center justify-center h-full w-full bg-black">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-orange-500 border-solid mx-auto mb-4"></div>
            <p className="text-xl text-white">Loading Telugu Channels from IPTV GitHub...</p>
          </div>
        </div>
      );
    }
    
    return (
      <div className="relative h-full w-full flex flex-col bg-gradient-to-b from-gray-900 to-black">
        {/* Header with icon and settings button */}
        <div className="flex justify-between items-center px-6 py-3 bg-black/40 backdrop-blur-sm z-10">
          <div className="flex items-center gap-3">
            <div className="text-3xl">📺</div>
            <h1 className="text-xl font-bold tracking-wide text-orange-400">Telugu IPTV</h1>
            <span className="text-xs bg-gray-800 px-2 py-1 rounded-full">Tizen OS 9</span>
          </div>
          <button 
            onClick={toggleSettings}
            className="bg-gray-800 hover:bg-gray-700 p-2 rounded-full focus:outline-none focus:ring-2 focus:ring-orange-500"
            aria-label="Settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
        
        {/* Main content area: left categories + player (right-aligned rectangular box) */}
        <div className="flex flex-1 min-h-0 overflow-hidden px-4 gap-4">
          {/* Left side - Vertical channel categories */}
          <div className="w-64 flex-shrink-0 bg-gray-900/60 rounded-2xl p-3 overflow-y-auto custom-scroll backdrop-blur-sm">
            <h2 className="text-lg font-semibold mb-3 text-orange-300 border-l-4 border-orange-500 pl-2">Categories</h2>
            <div className="space-y-2">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`w-full text-left px-3 py-2 rounded-xl transition-all focus:outline-none ${
                    selectedCategory === cat 
                      ? 'bg-orange-600 text-white shadow-lg' 
                      : 'bg-gray-800/70 text-gray-200 hover:bg-gray-700'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="mt-6 text-xs text-gray-400 text-center">
              <p>📡 {channels.length} channels</p>
              <p>⭐ IPTV-ORG / Telugu</p>
            </div>
          </div>
          
          {/* Right area: Player box (rectangular, slightly toward right) */}
          <div className="flex-1 flex justify-end items-start p-1">
            <div className="w-[75%] max-w-4xl bg-black rounded-2xl shadow-2xl overflow-hidden border border-gray-700">
              <div className="relative pt-[56.25%] bg-black">
                {!useNativeFallback ? (
                  <video 
                    ref={videoRef}
                    className="absolute top-0 left-0 w-full h-full object-contain"
                    controls={false}
                    autoPlay
                    playsInline
                  />
                ) : (
                  <video 
                    ref={nativeVideoRef}
                    className="absolute top-0 left-0 w-full h-full object-contain"
                    controls={false}
                    autoPlay
                    playsInline
                  />
                )}
                {playerError && !useNativeFallback && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white">
                    <p>Shaka Player error, using native fallback...</p>
                  </div>
                )}
                <div className="absolute bottom-2 left-3 bg-black/60 text-xs px-2 py-1 rounded">
                  {activeChannel?.name || 'No channel'}
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Bottom single row: channel cards with logos from m3u */}
        <div className="w-full px-4 pb-6 pt-2">
          <div className="overflow-x-auto custom-scroll">
            <div className="flex gap-3 pb-2">
              {filteredChannels.map((channel, idx) => (
                <button
                  key={idx}
                  onClick={() => handleChannelSelect(channel)}
                  className={`channel-card flex-shrink-0 w-32 bg-gray-800/80 rounded-xl p-2 flex flex-col items-center text-center transition-all focus:outline-none ${
                    activeChannel?.url === channel.url ? 'active-channel bg-gray-700 border-orange-500' : 'hover:bg-gray-700'
                  }`}
                >
                  <div className="w-12 h-12 bg-gray-700 rounded-full flex items-center justify-center overflow-hidden mb-1">
                    {channel.logo ? (
                      <img src={channel.logo} alt={channel.name} className="w-full h-full object-contain" onError={(e) => e.target.style.display = 'none'} />
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
        
        {/* Settings Popup from right */}
        <div className={`fixed inset-y-0 right-0 w-80 bg-gray-900 shadow-2xl transform transition-transform duration-300 ease-in-out z-50 ${settingsOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="flex flex-col h-full">
            <div className="flex justify-between items-center p-4 border-b border-gray-700">
              <h2 className="text-xl font-bold text-orange-400">⚙️ Settings</h2>
              <button onClick={toggleSettings} className="text-gray-400 hover:text-white text-2xl">&times;</button>
            </div>
            <div className="p-4 space-y-6 flex-1">
              <div>
                <p className="text-sm text-gray-300 mb-2">🎵 Audio Language</p>
                <select className="w-full bg-gray-800 rounded p-2 text-white">
                  <option>Telugu (Original)</option>
                  <option>English</option>
                </select>
              </div>
              <div>
                <p className="text-sm text-gray-300 mb-2">🔄 Playback Speed</p>
                <div className="flex gap-2">
                  {['0.75', '1.0', '1.25', '1.5'].map(speed => (
                    <button key={speed} className="bg-gray-800 px-3 py-1 rounded-full text-sm">x{speed}</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-300 mb-2">🖥️ Player Engine</p>
                <p className="text-xs text-gray-400">Shaka Player (Fallback: Native HLS)</p>
              </div>
              <div className="absolute bottom-4 left-4 right-4 text-center text-xs text-gray-500">
                Telugu IPTV • Playlist from iptv-org • Samsung Tizen
              </div>
            </div>
          </div>
        </div>
        {settingsOpen && (
          <div className="fixed inset-0 bg-black/30 z-40" onClick={toggleSettings}></div>
        )}
      </div>
    );
  };
  
  // Mount React app
  ReactDOM.render(React.createElement(App), document.getElementById('root'));
})();
