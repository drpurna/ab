// Telugu IPTV - Debug version with React
window.debug('bundle.js started');

// Wait for React to load
if (typeof React === 'undefined') {
  window.debug('ERROR: React not loaded');
  document.getElementById('root').innerHTML = '<div style="color:white; padding:20px;">React failed to load. Check internet.</div>';
} else {
  window.debug('React loaded');
}

(function() {
  const { useState, useEffect, useRef } = React;

  // Simple M3U parser
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

  const FALLBACK_CHANNELS = [
    { name: "ETV Telugu", logo: "", group: "Entertainment", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
    { name: "Gemini TV", logo: "", group: "Entertainment", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" },
    { name: "TV9 Telugu", logo: "", group: "News", url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" }
  ];

  const App = () => {
    const [channels, setChannels] = useState([]);
    const [categories, setCategories] = useState(['All']);
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [activeChannel, setActiveChannel] = useState(null);
    const [loading, setLoading] = useState(true);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [error, setError] = useState(null);
    
    const videoRef = useRef(null);

    // Fetch playlist
    useEffect(() => {
      window.debug('Fetching playlist...');
      const fetchPlaylist = async () => {
        try {
          const url = 'https://raw.githubusercontent.com/iptv-org/iptv/master/playlists/telugu.m3u';
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const text = await res.text();
          let parsed = parseM3U(text).filter(ch => ch.url && ch.url.startsWith('http'));
          if (parsed.length === 0) throw new Error('No channels');
          window.debug(`Loaded ${parsed.length} channels`);
          setChannels(parsed);
          const cats = ['All', ...new Set(parsed.map(ch => ch.group).filter(Boolean))];
          setCategories(cats);
          setActiveChannel(parsed[0]);
        } catch (err) {
          window.debug(`Playlist error: ${err.message}`);
          setError(`Using fallback channels: ${err.message}`);
          setChannels(FALLBACK_CHANNELS);
          setCategories(['All', 'Entertainment', 'News']);
          setActiveChannel(FALLBACK_CHANNELS[0]);
        } finally {
          setLoading(false);
        }
      };
      fetchPlaylist();
    }, []);

    const filteredChannels = selectedCategory === 'All' 
      ? channels 
      : channels.filter(ch => ch.group === selectedCategory);

    // Play channel
    useEffect(() => {
      if (!activeChannel || !videoRef.current) return;
      window.debug(`Playing: ${activeChannel.name} - ${activeChannel.url}`);
      const video = videoRef.current;
      video.src = activeChannel.url;
      video.load();
      video.play().catch(e => window.debug(`Play error: ${e.message}`));
    }, [activeChannel]);

    if (loading) {
      return (
        <div className="flex items-center justify-center h-full w-full bg-black text-white">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-orange-500 mx-auto mb-4"></div>
            <p>Loading Telugu channels...</p>
            <p className="text-xs text-gray-400 mt-2">(This may take a few seconds)</p>
          </div>
        </div>
      );
    }

    return (
      <div className="relative h-full w-full flex flex-col bg-gradient-to-b from-gray-900 to-black">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-3 bg-black/50 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <span className="text-3xl">📺</span>
            <h1 className="text-xl font-bold text-orange-400">Telugu IPTV</h1>
            <span className="text-xs bg-gray-800 px-2 py-1 rounded-full">Debug</span>
          </div>
          <button onClick={() => setSettingsOpen(true)} className="bg-gray-800 p-2 rounded-full">⚙️</button>
        </div>

        {/* Main area */}
        <div className="flex flex-1 min-h-0 overflow-hidden px-4 gap-4 mt-2">
          {/* Left categories */}
          <div className="w-64 flex-shrink-0 bg-gray-900/60 rounded-2xl p-3 overflow-y-auto custom-scroll">
            <h2 className="text-lg font-semibold mb-3 text-orange-300">Categories</h2>
            <div className="space-y-2">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`w-full text-left px-3 py-2 rounded-xl transition ${
                    selectedCategory === cat ? 'bg-orange-600' : 'bg-gray-800/70 hover:bg-gray-700'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="mt-6 text-xs text-gray-400 text-center">
              {channels.length} channels
            </div>
            {error && <div className="mt-4 text-xs text-red-400">{error}</div>}
          </div>

          {/* Player box - shifted right */}
          <div className="flex-1 flex justify-end items-start">
            <div className="w-[75%] max-w-4xl bg-black rounded-xl border border-gray-700 overflow-hidden">
              <div className="relative pt-[56.25%] bg-black">
                <video
                  ref={videoRef}
                  className="absolute top-0 left-0 w-full h-full object-contain"
                  autoPlay
                  playsInline
                />
                <div className="absolute bottom-2 left-3 bg-black/60 text-xs px-2 py-1 rounded">
                  {activeChannel?.name || 'No channel'}
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
                <button
                  key={idx}
                  onClick={() => setActiveChannel(ch)}
                  className={`flex-shrink-0 w-32 bg-gray-800/80 rounded-xl p-2 flex flex-col items-center ${
                    activeChannel?.url === ch.url ? 'ring-2 ring-orange-500' : ''
                  }`}
                >
                  <div className="w-12 h-12 bg-gray-700 rounded-full flex items-center justify-center mb-1">
                    {ch.logo ? (
                      <img src={ch.logo} className="w-full h-full object-contain" onError={e => e.target.style.display = 'none'} alt="" />
                    ) : (
                      <span className="text-2xl">📡</span>
                    )}
                  </div>
                  <span className="text-xs truncate w-full">{ch.name}</span>
                  <span className="text-[10px] text-gray-400">{ch.group}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Settings panel */}
        <div className={`fixed inset-y-0 right-0 w-80 bg-gray-900 shadow-2xl transform transition-transform duration-300 z-50 ${
          settingsOpen ? 'translate-x-0' : 'translate-x-full'
        }`}>
          <div className="p-4">
            <div className="flex justify-between">
              <h2 className="text-xl font-bold text-orange-400">Settings</h2>
              <button onClick={() => setSettingsOpen(false)} className="text-white">✖</button>
            </div>
            <div className="mt-4 text-sm text-gray-300">
              <p>Player: Native HLS</p>
              <p>Playlist: GitHub IPTV (Telugu)</p>
            </div>
          </div>
        </div>
        {settingsOpen && <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setSettingsOpen(false)}></div>}
      </div>
    );
  };

  // Add missing scroll style
  const style = document.createElement('style');
  style.textContent = `
    .custom-scroll::-webkit-scrollbar { height: 6px; width: 6px; }
    .custom-scroll::-webkit-scrollbar-track { background: #1f2937; border-radius: 4px; }
    .custom-scroll::-webkit-scrollbar-thumb { background: #f97316; border-radius: 4px; }
  `;
  document.head.appendChild(style);

  // Render
  const rootEl = document.getElementById('root');
  if (rootEl) {
    window.debug('Rendering React app...');
    try {
      ReactDOM.render(React.createElement(App), rootEl);
      window.debug('Render successful');
    } catch (err) {
      window.debug(`Render error: ${err.message}`);
      rootEl.innerHTML = `<div style="color:white; padding:20px;">React render error: ${err.message}</div>`;
    }
  } else {
    window.debug('Root element not found!');
  }
})();