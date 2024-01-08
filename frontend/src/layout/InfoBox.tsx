import { Grid, GridProps } from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';
import React from 'react';

type Props = {
  textBlock: React.JSX.Element | string;
} & GridProps;

export default function InfoBox({ textBlock, ...gridProps }: Props) {
  return (
    <Grid container item textAlign="left" {...gridProps} sx={{ flexFlow: 'row', alignItems: 'start', ...gridProps.sx }}>
      <Grid item mr={1}>
        <InfoIcon color="info" />
      </Grid>
      <Grid item>{textBlock}</Grid>
    </Grid>
  );
}
