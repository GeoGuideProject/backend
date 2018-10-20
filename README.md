# [GeoGuide](https://geoguide.herokuapp.com)

## Quick Start

### Requirements

- [**Python**](https://www.python.org/downloads/)
- [**pipenv**](https://pipenv.readthedocs.io/en/latest/install/#installing-pipenv)

### Basics

Install the required packages

```sh
$ pipenv install --dev
```

### Set Environment Variables

```sh
$ cp .env.example .env
```

Generate a new APP_KEY

```sh
$ pipenv run python generate_key.py
```

### Create DB

First you have to open pipenv shell

```sh
$ pipenv shell
```

> If you don't have postgres installed, you can use [Docker](https://docs.docker.com/install/linux/docker-ce/ubuntu/) with [Docker Compose](https://docs.docker.com/compose/install/) to start a database container executing
>
> ```sh
> $ docker-compose up -d db
> ```

Then you execute

```sh
$ python manage.py db init
$ python manage.py db upgrade
```

### Get a dataset

You can [download a .zip](https://github.com/GeoGuideProject/datasets/archive/master.zip) with all current supported datasets.

Feel free to try another dataset.

### Run the Application

```sh
$ python manage.py runserver
```

So access the application at the address [http://localhost:5000/](http://localhost:5000/)

> Want to specify a different port?

> ```sh
> $ python manage.py runserver -h 0.0.0.0 -p 8080
> ```

Now you are ready to run the [frontend project](https://github.com/GeoGuideProject/frontend)

### Testing

Without coverage:

```sh
$ python manage.py test
```

With coverage:

```sh
$ python manage.py cov
```
