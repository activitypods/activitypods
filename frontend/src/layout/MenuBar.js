import React from 'react';
import { useGetIdentity } from "react-admin";
import {
  Box,
  Container,
  Breadcrumbs,
  Link,
  makeStyles
} from "@material-ui/core";

const useStyles = makeStyles(theme => ({
  menuBar: {
    backgroundColor: 'white',
    borderBottomColor: theme.palette.primary.main,
    borderBottomStyle: 'solid',
    borderBottomWidth: 4
  },
  link: {
    fontSize: '14pt',
    color: 'black',
    fontWeight: '300',
    lineHeight: '2.2em'
  }
}));

const MenuBar = ({ title, logout }) => {
  const classes = useStyles();
  const { identity } = useGetIdentity();
  return(
    <Box className={classes.menuBar}>
      <Container>
        <Breadcrumbs separator="|">
          <Link href="/Profile" className={classes.link}>
            Mon réseau
          </Link>
          <Link href={"/Profile/" + encodeURIComponent(identity?.profileData?.id)} className={classes.link}>
            Mon profil
          </Link>
          <Link href="/Location" className={classes.link}>
            Mes adresses
          </Link>
          <Link href="/settings" className={classes.link}>
            Paramètres
          </Link>
        </Breadcrumbs>
      </Container>
    </Box>
  )
};

export default MenuBar;

