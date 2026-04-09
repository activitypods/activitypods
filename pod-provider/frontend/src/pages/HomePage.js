import React, { useEffect } from 'react';
import { Box, Button, Typography, Paper } from '@mui/material';
import { useGetIdentity, useTranslate, useRedirect, LocalesMenuButton, useLocaleState } from 'react-admin';
import { Link as RouterLink } from 'react-router-dom';
import { availableLocales } from '../config/i18nProvider';
import Header from '../common/Header';
import StorageIcon from '@mui/icons-material/Storage';
import AppsIcon from '@mui/icons-material/Apps';
import LockIcon from '@mui/icons-material/Lock';
import PeopleIcon from '@mui/icons-material/People';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';

const usageItems = [
  {
    icon: <StorageIcon sx={{ color: '#5B57E5', fontSize: 22 }} />,
    titleKey: 'app.steps.1.title',
    textKey: 'app.steps.1.text'
  },
  {
    icon: <AppsIcon sx={{ color: '#5B57E5', fontSize: 22 }} />,
    titleKey: 'app.steps.2.title',
    textKey: 'app.steps.2.text'
  },
  {
    icon: <LockIcon sx={{ color: '#5B57E5', fontSize: 22 }} />,
    titleKey: 'app.steps.3.title',
    textKey: 'app.steps.3.text'
  },
  {
    icon: <PeopleIcon sx={{ color: '#5B57E5', fontSize: 22 }} />,
    titleKey: 'app.steps.4.title',
    textKey: 'app.steps.4.text'
  },
  {
    icon: <ChatBubbleOutlineIcon sx={{ color: '#5B57E5', fontSize: 22 }} />,
    titleKey: 'app.steps.5.title',
    textKey: 'app.steps.5.text'
  }
];

const HomePage = () => {
  const { data: identity, isLoading } = useGetIdentity();
  const redirect = useRedirect();
  const [locale] = useLocaleState();
  const translate = useTranslate();

  useEffect(() => {
    if (!isLoading && identity?.id) {
      redirect('/network');
    }
  }, [redirect, isLoading, identity]);

  if (isLoading || identity?.id) return null;

  return (
    <>
      <Header title="app.titles.home" />

      {/* Top minimal header bar */}
      <Box
        sx={{
          backgroundColor: 'rgba(255,255,255,0.7)',
          backdropFilter: 'blur(4px)',
          borderBottom: '1px solid rgba(0,0,0,0.06)',
          py: { xs: 1, sm: 1.25 },
          px: { xs: 1.25, sm: 3 },
          display: { xs: 'flex', sm: 'grid' },
          gridTemplateColumns: { sm: '1fr auto 1fr' },
          alignItems: 'center',
          justifyContent: { xs: 'space-between', sm: 'initial' },
          columnGap: 1
        }}
      >
        <Box sx={{ display: { xs: 'none', sm: 'block' } }} />
        <Typography
          sx={{
            fontWeight: 600,
            fontSize: { xs: 12, sm: 15 },
            color: '#2D2D2D',
            letterSpacing: 0.2,
            textAlign: { xs: 'left', sm: 'center' },
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: { xs: '56vw', sm: 'none' },
            minWidth: 0,
            pr: { xs: 1, sm: 0 }
          }}
        >
          Memory ActivityPods
        </Typography>
        {availableLocales.length > 1 && (
          <Box sx={{ justifySelf: { sm: 'end' }, flexShrink: 0 }}>
            <LocalesMenuButton />
          </Box>
        )}
      </Box>

      {/* Main landing area */}
      <Box
        sx={{
          minHeight: 'calc(100vh - 53px)',
          background: 'radial-gradient(ellipse at 60% 40%, #e8e0d0 0%, #d4c9b5 40%, #c8bcaa 100%)',
          backgroundSize: 'cover',
          display: 'flex',
          alignItems: 'center',
          px: { xs: 3, md: 8 },
          py: { xs: 6, md: 0 }
        }}
      >
        <Box
          sx={{
            width: '100%',
            maxWidth: 1100,
            mx: 'auto',
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            alignItems: 'center',
            gap: { xs: 5, md: 8 }
          }}
        >
          {/* Left: headline + CTA */}
          <Box sx={{ flex: 1 }}>
            <Typography
              variant="h1"
              sx={{
                fontSize: { xs: 28, md: 36 },
                fontWeight: 700,
                color: '#1a1a1a',
                lineHeight: 1.25,
                mb: 2
              }}
            >
              Pod Provider for the
              <br />
              Memory Application
            </Typography>
            <Typography
              sx={{
                fontSize: 13,
                color: '#4a4a4a',
                mb: 4,
                maxWidth: 360,
                lineHeight: 1.6
              }}
            >
              Your data belongs to you. Memory gives you a personal Pod — a private, portable space where you decide
              what to store, who to share with, and which apps to trust. Simple, secure, and entirely yours.
            </Typography>
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <Button
                variant="contained"
                component={RouterLink}
                to="/login?signup"
                sx={{
                  backgroundColor: '#5B57E5',
                  color: '#fff',
                  borderRadius: 50,
                  px: 3,
                  textTransform: 'none',
                  fontWeight: 600,
                  '&:hover': { backgroundColor: '#4a46d4' }
                }}
              >
                Sign-Up
              </Button>
              <Button
                variant="outlined"
                component={RouterLink}
                to="/login"
                sx={{
                  borderColor: '#1a1a1a',
                  color: '#1a1a1a',
                  borderRadius: 50,
                  px: 3,
                  textTransform: 'none',
                  fontWeight: 600,
                  backgroundColor: 'transparent',
                  '&:hover': { backgroundColor: 'rgba(0,0,0,0.06)', borderColor: '#1a1a1a' }
                }}
              >
                Log-In
              </Button>
            </Box>
          </Box>

          {/* Right: Usage card */}
          <Paper
            elevation={0}
            sx={{
              flex: 1,
              maxWidth: 420,
              borderRadius: 4,
              p: 3.5,
              backgroundColor: '#fff'
            }}
          >
            <Typography sx={{ fontWeight: 700, fontSize: 22, mb: 2.5, color: '#1a1a1a' }}>Usage</Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {usageItems.map((item, idx) => (
                <Box key={idx} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                  <Box sx={{ mt: 0.2, flexShrink: 0 }}>{item.icon}</Box>
                  <Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', lineHeight: 1.4 }}>
                      {translate(item.titleKey)}
                    </Typography>
                    {item.textKey && (
                      <Typography sx={{ fontSize: 12, color: '#6b6b6b', mt: 0.3, lineHeight: 1.5 }}>
                        {translate(item.textKey)}
                      </Typography>
                    )}
                  </Box>
                </Box>
              ))}
            </Box>
          </Paper>
        </Box>
      </Box>
    </>
  );
};

export default HomePage;
