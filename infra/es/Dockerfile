FROM docker.elastic.co/elasticsearch/elasticsearch:8.17.2

ENV discovery.type=single-node
ENV xpack.security.enabled=false
ENV xpack.security.enrollment.enabled=false
ENV xpack.ml.enabled=false
ENV ES_JAVA_OPTS="-Xms256m -Xmx256m"

EXPOSE 9200