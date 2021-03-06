import { Request, Response } from 'express';
import { hash, compare } from 'bcrypt';
import { User } from '../entity/User';
import { Group } from '../entity/Group';
import { Captcha } from '../entity/Captcha';
import { RefreshToken } from '../entity/RefreshToken';
import signJWT from '../utils/signJTW';
import * as RToken from '../models/refreshToken';
import { createCanvas } from 'canvas';
import db from '../utils/dbUtils';

// Register Funktion
const register = async (req: Request, res: Response): Promise<Response> => {
	const { username, password, captchatext, captchaid } = req.body;
	const name = await db.findOne(User, { name: username });
	const captchas = await db.get_repo(Captcha);
	if (name) {
		return res.status(400).json({
			message: 'user already exists!',
		});
	} else {
		const captcha = await captchas.findOne({ id: captchaid });
		if (captcha) {
			const splitted = captchatext.split(',');
			const vx = Number(splitted[0]) - captcha.x;
			const vy = Number(splitted[1]) - captcha.y;
			if (Math.sqrt(vx * vx + vy * vy) < 10.0) {
				captchas.delete(captcha);
				const user = new User();
				user.name = username;
				user.password = await hash(password, 1);
				await db.save(User, user);
				return res.status(200).json({
					message: 'succesfully added user',
				});
			} else {
				console.log('failed captcha');
				return res.status(401).json({
					message: 'failed',
				});
			}
		} else {
			console.log('captcha not found');
			return res.status(401).json({
				message: 'failed',
			});
		}
	}

	return res.status(400).json({
		message: 'not implemented',
	});
};
//Login Funktion
const login = async (req: Request, res: Response): Promise<Response> => {
	const { username, password } = req.body;
	const user = await db.findOne(User, { name: username });
	if (user) {
		compare(password, user.password, (error, result) => {
			if (error) {
				console.log(error);
				return res.status(500).json({
					message: 'Internal Server Error.',
				});
			} else if (result) {
				signJWT(user.id, async (_error, token) => {
					if (_error) {
						console.log(_error);
						return res.status(500).json({
							message: 'Internal Server Error.',
						});
					} else {
						user.token = token;
						await db.save(User, user);
						const rtoken = await RToken.default.createToken(user);
						await db.save(RefreshToken, rtoken);
						res.cookie('refreshtoken', rtoken.token, {
							httpOnly: true,
							secure: true,
							signed: true,
						});
						return res.status(200).json({
							message: 'Login succesful.',
							accesstoken: token,
							user: user.name,
						});
					}
				});
			}
		});
	} else {
		return res.status(400).json({
			message: 'User not found or password wrong!',
		});
	}
};

const refreshToken = async (req: Request, res: Response): Promise<Response> => {
	const { refreshtoken: requesttoken } = req.signedCookies;

	if (!requesttoken) {
		return res.status(403).json({ message: 'Refresh Token is required!' });
	}

	try {
		const rtokens = await db.get_repo(RefreshToken);
		const tokenobj = await rtokens.findOne({ token: requesttoken }, { relations: ['user'] });
		if (!tokenobj) {
			res.clearCookie('refreshToken');
			res.status(403).json({ message: 'Refresh token is not in database!' });
			return;
		}

		if (RToken.default.verifyExpiration(tokenobj)) {
			res.clearCookie('refreshToken');
			rtokens.remove(tokenobj);
			res.status(403).json({
				message: 'Refresh token was expired. Please make a new signin request',
			});
			return;
		} 
		signJWT(tokenobj.user.id, (_error, token) => {
			if (_error) {
				return res.status(500).json({
					message: _error.message,
					error: _error,
				});
			} else if (token) {
				return res.status(200).json({
					message: 'Refresh erfolgreich',
					accesstoken: token,
				});
			}
		});
	} catch (err) {
		return res.status(500).send({ message: err });
	}
};
const logout = async (req: Request, res: Response): Promise<void> => {
	try {
		const requestToken = req.signedCookies;
		res.clearCookie('refreshToken');
		await db
			.findOneDelete(RefreshToken, { user: req.user, token: requestToken })
			.then(() => res.status(204).json({ message: 'loggedout' }))
			.catch((err) => res.status(500).json({ message: err }));
	} catch (err) {
		res.status(400).json({ message: 'user was not logged in' });
	}
};

const getUser = async (req: Request, res: Response): Promise<void> => {
	const user = req.user as User;
	res.status(200).json(user);
};
const allUsers = async (req: Request, res: Response): Promise<any> => {
	if (req.user) {
		const users = await db.get_repo(User);
		const currentuser = await users.findOne(req.user);
		const group_admin = await db.findOne(Group, { name: 'admin' });
		const sqlresult = await users
			.createQueryBuilder('user')
			.leftJoinAndSelect('user.groups', 'group')
			.where('user.id=:id', { id: currentuser.id })
			.where('group.id=:id', { id: group_admin.id })
			.getOne();

		if (sqlresult) {
			let take = 20;
			let skip = 0;
			if (req.query['c']) {
				take = Number(req.query['c']);
			}
			if (req.query['s']) {
				skip = Number(req.query['s']);
			}
			const [result, total] = await users.findAndCount({
				select: ['id', 'name', 'created'],
				take: take,
				skip: skip,
			});
			return res.status(200).json({
				message: 'OK',
				users: result,
			});
		} else {
			return res.status(400).json({
				message: 'no permission',
			});
		}
	}
	return res.status(400).json({
		message: 'not implemented',
	});
};

const getcaptcha = async (req: Request, res: Response): Promise<any> => {
	const r = 10;
	const w = 220;
	const h = 120;
	const canvas = createCanvas(w, h);
	const ctx = canvas.getContext('2d');
	const captchas = await db.get_repo(Captcha);
	const captcha = new Captcha();

	ctx.beginPath();
	ctx.rect(0, 0, w, h);
	ctx.fillStyle = 'black';
	ctx.fill();
	ctx.lineWidth = Math.random() * 4 + 1;
	ctx.strokeStyle =
		'rgba(' +
		Math.round(Math.random() * 255.0) +
		', ' +
		Math.round(Math.random() * 255.0) +
		', ' +
		Math.round(Math.random() * 255.0) +
		', ' +
		(Math.random() * 0.5 + 0.5) +
		')';
	ctx.beginPath();
	const astart = 2.0 * Math.PI;
	const halfr = r / 2.0;
	const px = Math.random() * (w - r * 2) + r;
	const py = Math.random() * (h - r * 2) + r;
	captcha.x = px;
	captcha.y = py;
	captcha.text = px + ',' + py;
	console.log(px + ' ' + py);
	ctx.arc(px, py, r, astart, astart + 1.75 * Math.PI);
	ctx.stroke();
	for (let x = 0; x < 20; x++) {
		ctx.beginPath();
		ctx.lineWidth = Math.random() * 4 + 1;
		ctx.strokeStyle =
			'rgba(' +
			Math.round(Math.random() * 255.0) +
			', ' +
			Math.round(Math.random() * 255.0) +
			', ' +
			Math.round(Math.random() * 255.0) +
			', ' +
			Math.random() +
			')';
		ctx.arc(Math.random() * w, Math.random() * h, r + Math.random() * 12.0, 0.0, 2.0 * Math.PI);
		ctx.stroke();
	}

	captcha.image = canvas.toDataURL('image/jpeg', 0.9);
	captcha.id = (await captchas.save(captcha)).id;
	console.log(captcha.id);
	return res.status(200).json({
		message: 'OK',
		captcha: captcha.image,
		captchaid: captcha.id,
	});
	return res.status(400).json({
		message: 'not implemented',
	});
};
const changeName = async (req: Request, res: Response): Promise<void> => {
	const { username } = req.body;
	const ID = { _id: req.params.userId };
	const update = { username: username };

	/*User.findOneAndUpdate(ID, update, {
		new: true,
	})
		.then((username) => res.status(200).send(username))
		.catch((err) =>
			res.status(500).json({
				message: err.message,
				err,
			}),
		);*/
};

const changePassword = async (req: Request, res: Response): Promise<void> => {
	const { password } = req.body;
	const ID = { _id: req.params.userId };

	await hash(password, 10, (hashError, hash) => {
		if (hashError) {
			return res.status(401).json({
				message: hashError.message,
				error: hashError,
			});
		}

		/*User.findOneAndUpdate(
			ID,
			{ password: hash },
			{
				new: true,
			},
		)
			.then((password) => res.status(200).send(password))
			.catch((err) =>
				res.status(500).json({
					message: err.message,
					err,
				}),
			);*/
	});
};
export default {
	register,
	login,
	logout,
	getUser,
	refreshToken,
	allUsers,
	changeName,
	changePassword,
	getcaptcha,
};
