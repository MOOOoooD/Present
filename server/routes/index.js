var express = require('express');
var router = express.Router();
var dirToJson = require('dir-to-json');
var path = require('path')
const fs = require('fs')
const util = require('util')

// TODO do encryption properly
const key = "You/'ll never walk alone"
var encryptor = require('simple-encryptor')(key);

router.post('/data', function (req, res) {
	const hashed = encryptor.encrypt(req.body).replace(/\//g, '-');
	const url = "http://localhost:3000/" // TODO Global constant
	res.redirect(url + hashed);
});

router.get('/identify/*', function (req, res) {
	const token = req.params[0].replace(/-/g, '/');
	const unhashed = encryptor.decrypt(token)
	if (typeof unhashed == 'undefined' || unhashed === null) {
		res.status(404).send('Not Found');
	}
	else {
		res.send(unhashed);
	}
});

router.get('/listOfCourseLectures/:courseId', function (req, res) {
	dirToJson("./lectures/" + req.params.courseId.toString(), function (err, dirTree) {
		if (err) {
			throw err;
		} else {
			console.log(dirTree)
			res.send(dirTree);
		}
	});
});

router.get('/manifest/:courseId/:lectureName', function (req, res) {
	const fpath = "./lectures/" + req.params.courseId.toString() + '/' + req.params.lectureName.toString() + '/INFO'
	fs.readFile(fpath, 'utf8', function (err, contents) {
		if (err) {
			res.status(404).send('Not Found');
		}
		else {
			const re = /(?:whiteboardCount: (\d))(?:\s|.*)*(?:computerCount: (\d))/ //this is a little bit more delicate than I'd like it to be
			const found = contents.match(re)
			const manifest = {
				whiteboardCount: parseInt(found[1]), //for some reason there is a third capture group at 0...
				computerCount: parseInt(found[2]),
				input: found['input']
			}
			res.send(manifest)
		}
	})
})


router.get('/video/:courseId/:lectureName', function (req, res) {
	const fpath = "./lectures/" + req.params.courseId.toString() + '/' + req.params.lectureName.toString() + '/videoLarge.mp4'  // TODO tie this to absolute location
	const stat = fs.statSync(fpath)
	const fileSize = stat.size
	const range = req.headers.range
	if (range) {
		const parts = range.replace(/bytes=/, "").split("-")
		const start = parseInt(parts[0], 10)
		const end = parts[1]
			? parseInt(parts[1], 10)
			: fileSize - 1
		const chunksize = (end - start) + 1
		const file = fs.createReadStream(fpath, { start, end })
		const head = {
			'Content-Range': `bytes ${start}-${end}/${fileSize}`,
			'Accept-Ranges': 'bytes',
			'Content-Length': chunksize,
			'Content-Type': 'video/mp4',
		}
		res.writeHead(206, head);
		file.pipe(res);
	}
	else {
		const head = {
			'Content-Length': fileSize,
			'Content-Type': 'video/mp4',
		}
		res.writeHead(200, head)
		fs.createReadStream(fpath).pipe(res)
	}
});


/*
Scheme for sourceID
1-x is for computer, x is an feed number
2-x is for a whiteboard, x is for feed number
Maybe some diffing... 
*/
router.get('/image/:courseId/:lectureName/:sourceId/:time', function (req, res) {
	const feedType = (req.params["sourceId"].split("-")[0] === "1") ? "computer" : "whiteBoard"
	const feedId = req.params["sourceId"].split("-")[1]
	const fpath = "./lectures/" + req.params.courseId.toString() + '/' + req.params.lectureName.toString()
	util.promisify(fs.readFile)(fpath+ '/INFO', 'utf8').then( contents =>{
		const re = /(?:timestamp: (\d*))/
		const found = contents.match(re)[1];
		return parseInt(req.params.time) + parseInt(found)
	}).then( cTime => {
		util.promisify(fs.readdir)(fpath + '/' + feedType).then( files => {
			const fileName = files.reduce((result, file) => {
				const splitFileName = file.split('-')
				const fileTime = parseInt(splitFileName[2].split('.')[0])
				if(splitFileName[0] === feedType && splitFileName[1] === feedId && fileTime <= cTime){
					result.push({
						name: file,
						time: fileTime
					})
				}
				return result
			}, []).sort((left, right) => left.time - right.time).pop() //this should be the file
			if(typeof fileName != 'undefined' && fileName != null){
				res.sendFile(path.resolve('lectures', req.params.courseId.toString(), req.params.lectureName.toString(), feedType, fileName.name))
			}
			else{
				res.status(404).send()
			}
		}).catch( err => res.status(404).send(err))
	}).catch( err => {
		res.status(404).send(err)
	})
});

module.exports = router;