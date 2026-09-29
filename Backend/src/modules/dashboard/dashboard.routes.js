'use strict';

const express = require('express');
const ctrl = require('./dashboard.controller');
const { authenticate } = require('../../middleware/authenticate');

const router = express.Router();

router.get('/summary', authenticate, ctrl.summary);

module.exports = router;
