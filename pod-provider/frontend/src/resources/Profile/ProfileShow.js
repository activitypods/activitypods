import React, { useEffect } from 'react';
import { ShowBase, useRecordContext } from 'react-admin';
import { useNavigate } from 'react-router-dom';
import { formatUsername } from '../../utils';

const RedirectToActorPage = () => {
  const record = useRecordContext();
  const navigate = useNavigate();

  useEffect(() => {
    if (record) {
      const username = formatUsername(record.describes);
      navigate(`/network/${username}`, { replace: true });
    }
  }, [navigate, record]);

  return null;
};

const ProfileShow = () => (
  <ShowBase>
    <RedirectToActorPage />
  </ShowBase>
);

export default ProfileShow;
