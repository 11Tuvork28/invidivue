import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import passport from 'passport';
// midlleware imports
import passportStrat from './middleware/passport';
// utils imports
import logging from './config/logging';
import db from './utils/dbUtils';
// routes imports
import * as userRoutes from './routes/user';
import * as userYoutube from './routes/youtube';
import controller from './controllers/youtubeController';
const NAMESPACE = 'Server';

logging.info(NAMESPACE, 'Running database setup');
(async () => {
    await db.setUp();
})();
const app = express();

/**
 * Log the request
 * */
app.use((req, res, next) => {
	/**
	 * Log the request
	 * */
	logging.info(NAMESPACE, `METHOD: [${req.method}] - URL: [${req.url}] - IP: [${req.socket.remoteAddress}]`);

	res.on('finish', () => {
		/**
		 * Log the result
		 * */
		logging.info(NAMESPACE, `METHOD: [${req.method}] - URL: [${req.url}] - STATUS: [${res.statusCode}] - IP: [${req.socket.remoteAddress}]`);
	});

	next();
});

/*
 * Parse the body of the request
 */
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser(process.env.COOKIE_SECRET));

/**
 * Passport
 *  */
passportStrat(passport);
app.use(passport.initialize());

/**
 * Rules of our API
 * */
 app.use(cors({ credentials: true, origin: ['http://localhost:8080','http://localhost', 'http://localhost:5000'],
 exposedHeaders: ["set-cookie"] }));


/**
 *  Routes go here
 *  */
app.use('/api/user', userRoutes.router);
app.use('/au', userRoutes.router);
app.use('/api/youtube', userYoutube.router);
app.use('/ay', userYoutube.router);
/**
 * Error handling
 *  */
app.use((req, res, next) => {
	const error = new Error('Not found');

	res.status(404).json({
		message: error.message,
	});
	next();
});
setInterval(()=>{
	controller.updatefeeds();
},1000*60);
app.listen(process.env.SERVER_PORT, () => logging.info(NAMESPACE, `Server is running ${process.env.SERVER_HOSTNAME}:${process.env.SERVER_PORT}`));
export default app;
