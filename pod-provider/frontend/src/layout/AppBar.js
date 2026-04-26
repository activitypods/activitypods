import React from 'react';
import { Link, useTranslate } from 'react-admin';
import { Box, Container, Typography } from '@mui/material';
import { useLocation } from 'react-router-dom';
import UserMenu from './UserMenu';
import useRealmContext from '../hooks/useRealmContext';

const NAV_TABS = [
  { labelKey: 'app.page.contacts', path: '/network' },
  { labelKey: 'app.page.apps', path: '/apps' },
  { labelKey: 'app.page.settings', path: '/settings' }
];

const AppBar = ({ title }) => {
  const translate = useTranslate();
  const location = useLocation();
  const { isGroup } = useRealmContext();

  return (
    <Box
      component="header"
      sx={{
        backgroundColor: '#fff',
        borderBottom: '1px solid rgba(0,0,0,0.08)',
        py: 1,
        px: { xs: 2, sm: 0 }
      }}
    >
      <Container>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {/* Logo */}
          <Typography
            component={Link}
            to="/network"
            sx={{
              fontWeight: 600,
              fontSize: 14,
              color: '#2D2D2D',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              '&:hover': { color: '#2D2D2D' }
            }}
          >
            Memory ActivityPods
          </Typography>

          {/* Nav tabs — desktop only, hidden on mobile (BottomBar handles it) */}
          {!isGroup && (
            <Box
              component="nav"
              sx={{
                display: { xs: 'none', sm: 'flex' },
                gap: 0.5,
                ml: 2
              }}
            >
              {NAV_TABS.map(tab => {
                const active = location.pathname.startsWith(tab.path);
                return (
                  <Box
                    key={tab.path}
                    component={Link}
                    to={tab.path}
                    sx={{
                      px: 2,
                      py: 0.75,
                      borderRadius: 50,
                      fontSize: 13,
                      fontWeight: active ? 600 : 400,
                      color: active ? '#fff' : '#2D2D2D',
                      backgroundColor: active ? '#5B57E5' : 'transparent',
                      textDecoration: 'none',
                      transition: 'all 0.15s ease',
                      '&:hover': {
                        backgroundColor: active ? '#4a46d4' : 'rgba(0,0,0,0.05)',
                        color: active ? '#fff' : '#2D2D2D'
                      }
                    }}
                  >
                    {translate(tab.labelKey)}
                  </Box>
                );
              })}
            </Box>
          )}

          {/* Spacer */}
          <Box sx={{ flex: 1 }} />

          {/* User menu */}
          <UserMenu />
        </Box>
      </Container>
    </Box>
  );
};

export default AppBar;
