import { useCallback, useEffect, useRef, useState } from 'react';
import urlJoin from 'url-join';
import { useDataProvider, useLocaleState, useTranslate, useLogin, useNotify } from 'react-admin';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { Box, Button, Chip, TextField, Typography, Paper, CircularProgress, InputAdornment, IconButton } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import Header from '../common/Header';

const BlueskyGlyph = () => <Box component="img" src="/bluesky-logo.svg" alt="" aria-hidden sx={{ width: 16, height: 16 }} />;

// ─── Shared layout wrapper ────────────────────────────────────────────────────

const PageShell = ({ children, titleKey }) => {
  const translate = useTranslate();
  return (
    <>
      <Header title={titleKey} />
      <Box
        sx={{
          minHeight: '100vh',
          backgroundColor: '#F0EDE8',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}
      >
        {/* Top bar */}
        <Box
          sx={{
            width: '100%',
            backgroundColor: 'rgba(255,255,255,0.75)',
            backdropFilter: 'blur(4px)',
            borderBottom: '1px solid rgba(0,0,0,0.07)',
            py: { xs: 1, sm: 1.5 },
            px: { xs: 1.25, sm: 0 },
            display: 'grid',
            gridTemplateColumns: 'auto 1fr auto',
            alignItems: 'center',
            mb: 7
          }}
        >
          <Box sx={{ justifySelf: 'start' }}>
            <Link to="/" style={{ textDecoration: 'none' }}>
              <Button
                variant="text"
                startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />}
                sx={{ color: '#555', textTransform: 'none', fontSize: 13, minWidth: 0, px: 0.5 }}
              >
                Back
              </Button>
            </Link>
          </Box>
          <Typography
            sx={{
              fontWeight: 600,
              fontSize: { xs: 12, sm: 15 },
              color: '#2D2D2D',
              letterSpacing: 0.2,
              textAlign: 'center',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              minWidth: 0,
              px: 1
            }}
          >
            Memory ActivityPods
          </Typography>
          <Box sx={{ width: { xs: 8, sm: 24 }, justifySelf: 'end' }} />
        </Box>

        {children}
      </Box>
    </>
  );
};

// ─── Shared field style ───────────────────────────────────────────────────────

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: '10px',
    backgroundColor: '#f7f5f2',
    fontSize: 14,
    '& fieldset': { borderColor: '#e0dbd4' },
    '&:hover fieldset': { borderColor: '#bbb' },
    '&.Mui-focused fieldset': { borderColor: '#5B57E5', borderWidth: 1.5 }
  },
  '& .MuiInputLabel-root': { fontSize: 13 },
  '& .MuiInputLabel-root.Mui-focused': { color: '#5B57E5' }
};

const errorFieldSx = {
  ...fieldSx,
  '& .MuiOutlinedInput-root': {
    ...fieldSx['& .MuiOutlinedInput-root'],
    backgroundColor: '#fff0f0',
    '& fieldset': { borderColor: '#ffbdbd' }
  }
};

const validFieldSx = {
  ...fieldSx,
  '& .MuiOutlinedInput-root': {
    ...fieldSx['& .MuiOutlinedInput-root'],
    '& fieldset': { borderColor: '#4CAF50', borderWidth: 1.5 }
  }
};

// ─── Username shape validator (mirrors backend Stage A) ───────────────────────

function getLocalUsernameError(u) {
  if (!u || u.length < 3) return 'Username must be at least 3 characters';
  if (u.length > 30) return 'Username must be at most 30 characters';
  if (!/^[a-z0-9._-]+$/.test(u)) return 'Username may only contain letters, digits, dots, underscores, and hyphens';
  if (/^[._-]/.test(u) || /[._-]$/.test(u)) return 'Username must not start or end with punctuation';
  if (/[._-]{2,}/.test(u)) return 'Username must not contain consecutive punctuation characters';
  if (/^\d+$/.test(u)) return 'Username must not be all numbers';
  return null;
}

// ─── Sign-Up form ─────────────────────────────────────────────────────────────

const SignUpForm = ({ onSignup, interactionId }) => {
  const [locale] = useLocaleState();
  const translate = useTranslate();
  const dataProvider = useDataProvider();
  const notify = useNotify();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  // 'idle' | 'checking' | 'available' | 'taken' | 'blocked'
  const [usernameStatus, setUsernameStatus] = useState('idle');
  const [suggestions, setSuggestions] = useState([]);
  const abortRef = useRef(null);

  const finishInteraction = useCallback(async () => {
    if (interactionId) {
      await dataProvider.fetch(urlJoin(CONFIG.BACKEND_URL, '.oidc/login-completed'), {
        method: 'POST',
        body: JSON.stringify({ interactionId }),
        headers: new Headers({ 'Content-Type': 'application/json' })
      });
    }
  }, [interactionId, dataProvider]);

  // ── Debounced real-time availability check ────────────────────────────────
  useEffect(() => {
    const u = username.trim().toLowerCase();

    if (!u) {
      setUsernameStatus('idle');
      setSuggestions([]);
      setErrors(prev => { const e = { ...prev }; delete e.username; return e; });
      return;
    }

    const localErr = getLocalUsernameError(u);
    if (localErr) {
      setErrors(prev => ({ ...prev, username: localErr }));
      setUsernameStatus('idle');
      setSuggestions([]);
      return;
    }

    // Shape passes — clear local error and start debounced network check
    setErrors(prev => { const e = { ...prev }; delete e.username; return e; });
    setUsernameStatus('checking');
    setSuggestions([]);

    const controller = new AbortController();
    abortRef.current = controller;

    const timer = setTimeout(() => {
      const url = `${urlJoin(CONFIG.BACKEND_URL, 'v1/usernames/available')}?username=${encodeURIComponent(u)}`;
      fetch(url, { signal: controller.signal })
        .then(res => res.json())
        .then(data => {
          if (controller.signal.aborted) return;
          if (data.available) {
            setUsernameStatus('available');
            setSuggestions([]);
          } else if (data.taken) {
            setUsernameStatus('taken');
            setSuggestions(data.suggestions || []);
          } else {
            setUsernameStatus('blocked');
            setSuggestions(data.suggestions || []);
          }
        })
        .catch(err => {
          if (err.name === 'AbortError') return;
          // Network error or rate limit — fail silently; backend is the final arbiter
          setUsernameStatus('idle');
          setSuggestions([]);
        });
    }, 400);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [username]);

  const validate = () => {
    const errs = {};
    const u = username.trim().toLowerCase();
    const usernameErr = getLocalUsernameError(u);
    if (usernameErr) {
      errs.username = usernameErr;
    } else if (usernameStatus === 'taken') {
      errs.username = 'Username already taken';
    } else if (usernameStatus === 'blocked') {
      errs.username = 'Username not available';
    }
    if (!password || password.length < 8) errs.password = 'Password must be at least 8 characters';
    return errs;
  };

  const handleSubmit = async e => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setLoading(true);
    setErrors({});
    try {
      const res = await fetch(urlJoin(CONFIG.BACKEND_URL, 'auth/signup'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password, 'schema:knowsLanguage': locale })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data?.message || data?.error || 'Sign-up failed. Please try again.';
        if (msg.toLowerCase().includes('username')) setErrors({ username: msg });
        else if (msg.toLowerCase().includes('email')) setErrors({ email: msg });
        else notify(msg, { type: 'error' });
        return;
      }

      const data = await res.json().catch(() => null);
      const { token, webId } = data || {};

      if (!token || !webId) {
        // Backend returns 200+empty body when username is already taken (Moleculer plain-Error quirk)
        setErrors({ username: 'Username already taken. Please choose another.' });
        return;
      }

      if (token) localStorage.setItem('token', token);
      if (webId) localStorage.setItem('webId', webId);

      await finishInteraction();
      const redirectParam = new URLSearchParams(window.location.search).get('redirect') || '/network';
      window.location.href = `/initialize?redirect=${encodeURIComponent(redirectParam)}`;
    } catch (err) {
      notify('app.notification.signup_network_error', { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const instanceHost = CONFIG.BACKEND_URL ? new URL(CONFIG.BACKEND_URL).host : 'yourpod.example.org';

  return (
    <PageShell titleKey="app.titles.signup">
      <Paper
        elevation={0}
        component="form"
        onSubmit={handleSubmit}
        sx={{
          width: '100%',
          maxWidth: 380,
          borderRadius: '18px',
          p: '32px 36px 28px',
          backgroundColor: '#fff',
          boxShadow: '0 4px 32px rgba(0,0,0,0.08)'
        }}
      >
        <Typography sx={{ fontWeight: 700, fontSize: 26, color: '#1a1a1a', mb: 0.5 }}>
          Sign-Up
        </Typography>
        <Typography sx={{ fontSize: 13, color: '#888', mb: 3 }}>
          Create your personal space.
        </Typography>

        <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#333', mb: 0.75 }}>Username</Typography>
        <TextField
          fullWidth
          size="small"
          placeholder="username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          error={!!errors.username}
          helperText={errors.username || 'Use only local username (no @), e.g. myname'}
          sx={{
            ...(errors.username ? errorFieldSx : usernameStatus === 'available' ? validFieldSx : fieldSx),
            mb: suggestions.length > 0 ? 0.75 : 2
          }}
          inputProps={{ 'aria-label': 'Username', autoComplete: 'off', spellCheck: false }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end" sx={{ mr: 0.25 }}>
                {usernameStatus === 'checking' && (
                  <CircularProgress size={14} sx={{ color: '#aaa' }} />
                )}
                {usernameStatus === 'available' && (
                  <CheckCircleOutlineIcon sx={{ fontSize: 18, color: '#4CAF50' }} />
                )}
                {usernameStatus === 'taken' && (
                  <CancelOutlinedIcon sx={{ fontSize: 18, color: '#f44336' }} />
                )}
                {usernameStatus === 'blocked' && (
                  <BlockOutlinedIcon sx={{ fontSize: 18, color: '#FF9800' }} />
                )}
              </InputAdornment>
            )
          }}
        />

        {suggestions.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography sx={{ fontSize: 11, color: '#888', mb: 0.75 }}>
              Try one of these:
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
              {suggestions.map(s => (
                <Chip
                  key={s}
                  label={s}
                  size="small"
                  onClick={() => setUsername(s)}
                  sx={{
                    fontSize: 12,
                    height: 26,
                    cursor: 'pointer',
                    backgroundColor: '#f0effc',
                    color: '#5B57E5',
                    border: '1px solid #d5d3f8',
                    '&:hover': { backgroundColor: '#e0defa' }
                  }}
                />
              ))}
            </Box>
          </Box>
        )}

        <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#333', mb: 0.75 }}>E-Mail</Typography>
        <TextField
          fullWidth
          size="small"
          type="email"
          placeholder="mailadress@gmail.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          error={!!errors.email}
          helperText={errors.email}
          sx={{ ...fieldSx, mb: 2 }}
          inputProps={{ 'aria-label': 'E-Mail' }}
        />

        <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#333', mb: 0.75 }}>Password</Typography>
        <TextField
          fullWidth
          size="small"
          type={showPassword ? 'text' : 'password'}
          placeholder="••••••••••"
          value={password}
          onChange={e => setPassword(e.target.value)}
          error={!!errors.password}
          helperText={errors.password}
          sx={{ ...fieldSx, mb: 3.5 }}
          inputProps={{ 'aria-label': 'Password' }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setShowPassword(v => !v)} edge="end" tabIndex={-1}>
                  {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                </IconButton>
              </InputAdornment>
            )
          }}
        />

        <Button
          type="submit"
          fullWidth
          variant="contained"
          disabled={loading}
          sx={{
            backgroundColor: '#5B57E5',
            color: '#fff',
            borderRadius: 50,
            py: 1.25,
            textTransform: 'none',
            fontWeight: 600,
            fontSize: 14,
            mb: 2.5,
            boxShadow: 'none',
            '&:hover': { backgroundColor: '#4a46d4', boxShadow: 'none' }
          }}
        >
          {loading ? <CircularProgress size={20} sx={{ color: '#fff' }} /> : 'Sign-Up'}
        </Button>

        <Typography sx={{ fontSize: 13, color: '#888', textAlign: 'center' }}>
          Have an account already?{' '}
          <Link to="/login" style={{ color: '#5B57E5', fontWeight: 600, textDecoration: 'none' }}>
            Log-In
          </Link>
        </Typography>
      </Paper>
    </PageShell>
  );
};

// ─── Log-In form ──────────────────────────────────────────────────────────────

const LogInForm = ({ onLogin, interactionId, redirectTarget }) => {
  const login = useLogin();
  const notify = useNotify();
  const dataProvider = useDataProvider();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const normalizeIdentifier = value => {
    const raw = String(value || '').trim();
    if (!raw) return '';

    // Accept fediverse-style input like "@username@host" and map it to local username.
    const handleMatch = raw.match(/^@([a-zA-Z0-9._-]+)@[^@\s]+$/);
    if (handleMatch?.[1]) return handleMatch[1];

    // Also accept "@username" shorthand.
    if (raw.startsWith('@') && !raw.slice(1).includes('@')) {
      return raw.slice(1);
    }

    return raw;
  };

  const finishInteraction = useCallback(async () => {
    if (interactionId) {
      await dataProvider.fetch(urlJoin(CONFIG.BACKEND_URL, '.oidc/login-completed'), {
        method: 'POST',
        body: JSON.stringify({ interactionId }),
        headers: new Headers({ 'Content-Type': 'application/json' })
      });
    }
  }, [interactionId, dataProvider]);

  const handleSubmit = async (e, options = {}) => {
    e.preventDefault();
    if (!identifier || !password) { setPasswordError('Please fill in all fields'); return; }

    setLoading(true);
    setPasswordError('');
    try {
      const redirectAfterLogin = options.redirectAfterLogin || redirectTarget || '/network';
      const normalizedIdentifier = normalizeIdentifier(identifier);
      await login({ username: normalizedIdentifier, password }, redirectAfterLogin);
      await finishInteraction();
      navigate(redirectAfterLogin, { replace: true });
    } catch (err) {
      setPasswordError('Invalid username/email or password.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasskey = () => {
    notify('Passkey support coming soon.', { type: 'info' });
  };

  const instanceHost = CONFIG.BACKEND_URL ? new URL(CONFIG.BACKEND_URL).host : 'yourpod.example.org';

  return (
    <PageShell titleKey="app.titles.login">
      <Paper
        elevation={0}
        component="form"
        onSubmit={handleSubmit}
        sx={{
          width: '100%',
          maxWidth: 380,
          borderRadius: '18px',
          p: '32px 36px 28px',
          backgroundColor: '#fff',
          boxShadow: '0 4px 32px rgba(0,0,0,0.08)'
        }}
      >
        <Typography sx={{ fontWeight: 700, fontSize: 26, color: '#1a1a1a', mb: 0.5 }}>
          Log-In
        </Typography>
        <Typography sx={{ fontSize: 13, color: '#888', mb: 3 }}>
          Create your personal space.
        </Typography>

        <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#333', mb: 0.75 }}>
          Username or E-Mail Address
        </Typography>
        <TextField
          fullWidth
          size="small"
          placeholder="username or email"
          value={identifier}
          onChange={e => setIdentifier(e.target.value)}
          sx={{ ...fieldSx, mb: 2 }}
          inputProps={{ 'aria-label': 'Username or E-Mail' }}
          autoComplete="username"
        />

        <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#333', mb: 0.75 }}>Password</Typography>
        <TextField
          fullWidth
          size="small"
          type={showPassword ? 'text' : 'password'}
          placeholder="••••••••••"
          value={password}
          onChange={e => setPassword(e.target.value)}
          error={!!passwordError}
          helperText={passwordError}
          sx={passwordError ? { ...errorFieldSx, mb: 3 } : { ...fieldSx, mb: 3 }}
          inputProps={{ 'aria-label': 'Password' }}
          autoComplete="current-password"
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setShowPassword(v => !v)} edge="end" tabIndex={-1}>
                  {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                </IconButton>
              </InputAdornment>
            )
          }}
        />

        <Box sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
          <Button
            fullWidth
            variant="outlined"
            onClick={handlePasskey}
            sx={{
              borderColor: '#ddd',
              color: '#555',
              borderRadius: 50,
              textTransform: 'none',
              fontWeight: 500,
              fontSize: 13,
              py: 1.1,
              backgroundColor: '#f5f5f5',
              '&:hover': { backgroundColor: '#eee', borderColor: '#ccc' }
            }}
          >
            Use Passkey
          </Button>
          <Button
            type="submit"
            fullWidth
            variant="contained"
            disabled={loading}
            sx={{
              backgroundColor: '#5B57E5',
              color: '#fff',
              borderRadius: 50,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: 13,
              py: 1.1,
              boxShadow: 'none',
              '&:hover': { backgroundColor: '#4a46d4', boxShadow: 'none' }
            }}
          >
            {loading ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'Log-In'}
          </Button>
        </Box>

        <Button
          variant="outlined"
          disabled={loading}
          startIcon={<BlueskyGlyph />}
          onClick={e => handleSubmit(e, { redirectAfterLogin: '/settings/atproto-link' })}
          sx={{
            borderColor: '#1d9bf0',
            color: '#1d9bf0',
            borderRadius: 50,
            px: 2,
            py: 0.6,
            minWidth: 0,
            textTransform: 'none',
            fontWeight: 700,
            fontSize: 13,
            mb: 2,
            mx: 'auto',
            display: 'flex',
            backgroundColor: 'rgba(29,155,240,0.08)',
            '&:hover': {
              backgroundColor: 'rgba(29,155,240,0.16)',
              borderColor: '#1d9bf0'
            },
            '& .MuiButton-startIcon': { mr: 0.75 }
          }}
          aria-label="Log in and link Bluesky account"
        >
          bluesky
        </Button>

        <Typography sx={{ fontSize: 12, color: '#6b7280', textAlign: 'center', mb: 2, px: 2 }}>
          Use your MyPod.local username and password on this page. You will enter your Bluesky credentials on the next screen.
        </Typography>

        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1 }}>
          <Link to="/reset-password" style={{ color: '#aaa', fontSize: 13, textDecoration: 'none' }}>
            Reset password
          </Link>
          <Typography sx={{ color: '#aaa', fontSize: 13 }}>·</Typography>
          <Link to="/login?signup" style={{ color: '#aaa', fontSize: 13, textDecoration: 'none' }}>
            Sign-Up
          </Link>
        </Box>
      </Paper>
    </PageShell>
  );
};

// ─── Page entry point ─────────────────────────────────────────────────────────

const LoginPage = () => {
  const [searchParams] = useSearchParams();
  const interactionId = searchParams.get('interaction_id');
  const isSignup = searchParams.get('signup') !== null;
  const redirectTarget = searchParams.get('redirect') || '/network';

  return isSignup
    ? <SignUpForm interactionId={interactionId} />
    : <LogInForm interactionId={interactionId} redirectTarget={redirectTarget} />;
};

export default LoginPage;
