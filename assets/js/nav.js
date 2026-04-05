
(function () {
	const EASTER_EVENT_AUTO_ENABLE = true;
	const EASTER_EVENT_BOOT_KEY = 'ggui_easter_event_boot_v1';
	const EASTER_THEME = { accent: '#ff64b4', soft: '#ffd2ea', rgb: '255,100,180' };
	const THEME_MAP = {
		neon: { accent: '#00ffe7', soft: '#9ffcff', rgb: '0,255,231' },
		violet: { accent: '#b47cff', soft: '#dac0ff', rgb: '180,124,255' },
		crimson: { accent: '#ff5f8a', soft: '#ffc4d6', rgb: '255,95,138' }
	};

	function applyEventAutostart(settings) {
		if (!EASTER_EVENT_AUTO_ENABLE) return settings;
		const hasBooted = localStorage.getItem(EASTER_EVENT_BOOT_KEY) === '1';
		if (hasBooted) return settings;
		const updated = { ...settings, easterMode: true };
		localStorage.setItem('ggui_settings', JSON.stringify(updated));
		localStorage.setItem(EASTER_EVENT_BOOT_KEY, '1');
		return updated;
	}

	function getStoredSettings() {
		const fallback = { theme: 'neon', glow: true, buttonStyle: 'frosted', easterMode: false };
		const raw = localStorage.getItem('ggui_settings');
		if (!raw) return applyEventAutostart(fallback);
		try {
			const parsed = { ...fallback, ...JSON.parse(raw) };
			return applyEventAutostart(parsed);
		} catch {
			return applyEventAutostart(fallback);
		}
	}

	function ensureSyncStyles() {
		if (document.getElementById('gguiThemeSyncStyles')) return;
		const style = document.createElement('style');
		style.id = 'gguiThemeSyncStyles';
		style.textContent = `
			.top-bar {
				border-bottom: 1px solid rgba(var(--accent-rgb), 0.35) !important;
				box-shadow: 0 0 12px rgba(var(--accent-rgb), 0.22) !important;
			}
			.controller-home img,
			.nav-card img,
			.custom-cursor {
				filter: drop-shadow(0 0 8px var(--accent));
			}
			.custom-cursor {
				border-color: var(--accent) !important;
				box-shadow: 0 0 12px rgba(var(--accent-rgb), 0.7) !important;
			}
			.site-title,
			.startup-logo,
			.settings-header h2,
			.box-title {
				text-shadow: 0 0 18px var(--accent) !important;
			}
			.settings-header h2,
			.box-title,
			.settings-section h3 {
				color: var(--accent-soft) !important;
			}
			input:checked + .slider {
				background-color: var(--accent) !important;
			}
			.bg-opt.active,
			.theme-opt.active {
				border-color: var(--accent) !important;
				box-shadow: 0 0 10px var(--accent) !important;
			}
			.cloak-launch-btn,
			.box-btn:hover,
			.cloak-preset-btn:hover {
				box-shadow: 0 0 18px rgba(var(--accent-rgb), 0.65);
			}
			body.no-glow .top-link:hover,
			body.no-glow .discord-btn:hover,
			body.no-glow .nav-card:hover,
			body.no-glow .nav-card:hover::before,
			body.no-glow .custom-cursor,
			body.no-glow .controller-home img,
			body.no-glow .nav-card img,
			body.no-glow .site-title,
			body.no-glow .startup-logo,
			body.no-glow .settings-header h2 {
				animation: none !important;
				box-shadow: none !important;
				text-shadow: none !important;
				filter: none !important;
			}
		`;
		document.head.appendChild(style);
	}

	function applyThemeAndGlow() {
		const settings = getStoredSettings();
		const themeKey = Object.prototype.hasOwnProperty.call(THEME_MAP, settings.theme) ? settings.theme : 'neon';
		const buttonStyle = settings.buttonStyle === 'glass' ? 'glass' : 'frosted';
		const useEasterTheme = settings.easterMode === true;
		const theme = useEasterTheme ? EASTER_THEME : THEME_MAP[themeKey];
		const root = document.documentElement;

		root.style.setProperty('--accent', theme.accent);
		root.style.setProperty('--accent-soft', theme.soft);
		root.style.setProperty('--accent-rgb', theme.rgb);

		if (!document.body) return;
		document.body.classList.remove('theme-neon', 'theme-violet', 'theme-crimson');
		document.body.classList.add(`theme-${themeKey}`);
		document.body.classList.toggle('season-easter', useEasterTheme);
		document.body.classList.toggle('no-glow', settings.glow === false);
		document.body.classList.remove('btn-style-frosted', 'btn-style-glass');
		document.body.classList.add(`btn-style-${buttonStyle}`);
	}

	ensureSyncStyles();
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', applyThemeAndGlow);
	} else {
		applyThemeAndGlow();
	}

	window.addEventListener('storage', (event) => {
		if (event.key === 'ggui_settings') applyThemeAndGlow();
	});
})();


