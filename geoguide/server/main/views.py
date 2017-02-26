# geoguide/server/main/views.py


#################
#### imports ####
#################

from flask import render_template, Blueprint


################
#### config ####
################

main_blueprint = Blueprint('main', __name__,)


################
#### routes ####
################


@main_blueprint.route('/')
def home():
    return render_template('main/home.html')
