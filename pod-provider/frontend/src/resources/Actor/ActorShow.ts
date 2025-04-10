import { useEffect } from 'react';
import { useGetRecordId } from 'react-admin';
import { useNavigate } from 'react-router-dom';
import { formatUsername } from '../../utils';

const ActorShow = () => {
  const recordId = useGetRecordId();
  const navigate = useNavigate();

  useEffect(() => {
    const username = formatUsername(recordId);
    navigate(`/network/${username}`, { replace: true });
  }, [navigate, recordId]);

  return null;
};

export default ActorShow;
