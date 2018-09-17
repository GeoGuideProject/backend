import jwt
import arrow
from uuid import uuid4

import werkzeug
from flask import Blueprint, request
from flask_restful import Api, Resource, marshal_with, reqparse, abort, fields
from flask_login import current_user, login_required

from geoguide.server import app, db, dataset_manager
from geoguide.server.models import Dataset, AttributeType, Attribute
from geoguide.server.geoguide.helpers import save_as_sql


datasets_blueprint = Blueprint('api_datasets', __name__)
api = Api(datasets_blueprint, prefix='/api/v1', catch_all_404s=True)


attribute_fields = {
    'description': fields.String,
    'type': fields.String(attribute=lambda x: x.type.name),
    'visible': fields.Boolean
}

dataset_fields = {
    'id': fields.String(attribute=lambda x: x.filename.rsplit('.')[0]),
    'title': fields.String,
    'filename': fields.String,
    'latitudeAttr': fields.String(attribute="latitude_attr"),
    'longitudeAttr': fields.String(attribute="longitude_attr"),
    'createdAt': fields.DateTime(attribute="created_at", dt_format='iso8601'),
    'indexedAt': fields.DateTime(attribute="indexed_at", dt_format='iso8601'),
    'lastUsedAt': fields.DateTime(attribute="last_used_at", dt_format='iso8601'),
    'attributes': fields.List(fields.Nested(attribute_fields))
}


class DatasetBaseResource(Resource):

    def get_dataset(self, uuid):
        filename = '{}.csv'.format(uuid)
        return Dataset.query.filter_by(user_id=current_user.id, filename=filename).first_or_404()

    def get_datasets(self):
        return Dataset.query.filter_by(user_id=current_user.id).all()


class DatasetDetail(DatasetBaseResource):

    @marshal_with(dataset_fields)
    @login_required
    def get(self, uuid):
        return self.get_dataset(uuid)

    @login_required
    def post(self, uuid):
        parser = reqparse.RequestParser()
        parser.add_argument(
            'dataset', type=werkzeug.FileStorage, location='files', required=True)

        args = parser.parse_args()

        dataset = self.get_dataset(uuid)

        uploaded = args['dataset']
        dataset_manager.save(uploaded, name=dataset.filename)

        save_as_sql(dataset)

        return {}, 201


class DatasetList(DatasetBaseResource):

    parser = reqparse.RequestParser()
    parser.add_argument('title', type=str, required=True)
    parser.add_argument('latitudeAttr', type=str, required=True)
    parser.add_argument('longitudeAttr', type=str, required=True)
    parser.add_argument('datetimeAttrs', type=str,
                        action='append', default=[])
    parser.add_argument('visibleAttrs', type=str,
                        action='append', required=True)

    @marshal_with(dataset_fields)
    @login_required
    def get(self):
        return self.get_datasets()

    @marshal_with(dataset_fields)
    @login_required
    def post(self):
        args = self.parser.parse_args()
        filename = '{}.csv'.format(uuid4())

        dataset = Dataset(
            args['title'],
            filename,
            latitude_attr=args['latitudeAttr'],
            longitude_attr=args['longitudeAttr']
        )

        db.session.add(dataset)
        db.session.commit()

        for attr in args['datetimeAttrs']:
            attribute = Attribute(
                attr,
                AttributeType.datetime,
                dataset.id,
                visible=(attr in args['visibleAttrs'])
            )
            db.session.add(attribute)

        for attr in args['visibleAttrs']:
            if attr in args['datetimeAttrs']:
                continue
            attribute = Attribute(
                attr,
                AttributeType.unknown,
                dataset.id,
                visible=True
            )
            db.session.add(attribute)

        db.session.commit()
        return dataset


api.add_resource(DatasetDetail, "/datasets/<string:uuid>")
api.add_resource(DatasetList, "/datasets")
