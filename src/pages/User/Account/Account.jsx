import React from 'react';
import Helmet from 'react-helmet';

import './Account.css';
import BarTitle from '../../../components/BarTitle/BarTitle';

function AccountPage() {
  return (
    <section className="section">
      <Helmet title="My account" />
      <div className="container">
        <div className="AccountPage">
          <BarTitle hideOnSmall>
            <h2>My Account</h2>
          </BarTitle>
        </div>
      </div>
    </section>
  );
}
export default AccountPage;
